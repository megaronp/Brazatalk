import { Message, Server } from '../types';

const DB_NAME = 'BrazaTalk_Storage_v1';
const DB_VERSION = 1;

class OfflineStorage {
  private db: IDBDatabase | null = null;
  private isOnlineStatus: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private onlineListeners: Array<(isOnline: boolean) => void> = [];

  constructor() {
    this.initDB();
    this.initNetworkListeners();
  }

  private initNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnlineStatus = true;
        this.notifyOnlineListeners(true);
      });
      window.addEventListener('offline', () => {
        this.isOnlineStatus = false;
        this.notifyOnlineListeners(false);
      });
    }
  }

  public isOnline(): boolean {
    return this.isOnlineStatus;
  }

  public onNetworkChange(listener: (isOnline: boolean) => void): () => void {
    this.onlineListeners.push(listener);
    return () => {
      this.onlineListeners = this.onlineListeners.filter((l) => l !== listener);
    };
  }

  private notifyOnlineListeners(isOnline: boolean) {
    this.onlineListeners.forEach((l) => l(isOnline));
  }

  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        // Fallback for SSR or no indexedDB
        return resolve(null as unknown as IDBDatabase);
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Messages Store
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('channelId', 'channelId', { unique: false });
          msgStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Servers Store
        if (!db.objectStoreNames.contains('servers')) {
          db.createObjectStore('servers', { keyPath: 'id' });
        }

        // Offline Outbox
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event);
        reject(event);
      };
    });
  }

  /**
   * Save a single or array of messages into IndexedDB cache
   */
  public async cacheMessages(messages: Message[]): Promise<void> {
    try {
      const db = await this.initDB();
      if (!db) return;

      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      messages.forEach((msg) => store.put(msg));
    } catch (e) {
      console.warn('Cache messages error:', e);
    }
  }

  /**
   * Retrieve cached messages for a channel when offline
   */
  public async getCachedMessages(channelId: string): Promise<Message[]> {
    try {
      const db = await this.initDB();
      if (!db) return [];

      return new Promise((resolve) => {
        const tx = db.transaction('messages', 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('channelId');
        const request = index.getAll(channelId);

        request.onsuccess = () => {
          const results = (request.result as Message[]) || [];
          results.sort((a, b) => a.timestamp - b.timestamp);
          resolve(results);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Cache servers and their channels offline
   */
  public async cacheServers(servers: Server[]): Promise<void> {
    try {
      const db = await this.initDB();
      if (!db) return;

      const tx = db.transaction('servers', 'readwrite');
      const store = tx.objectStore('servers');
      servers.forEach((s) => store.put(s));
    } catch (e) {
      console.warn('Cache servers error:', e);
    }
  }

  /**
   * Retrieve cached servers
   */
  public async getCachedServers(): Promise<Server[]> {
    try {
      const db = await this.initDB();
      if (!db) return [];

      return new Promise((resolve) => {
        const tx = db.transaction('servers', 'readonly');
        const store = tx.objectStore('servers');
        const request = store.getAll();

        request.onsuccess = () => resolve((request.result as Server[]) || []);
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Queue message into offline outbox
   */
  public async queueOutboxMessage(msg: Message): Promise<void> {
    try {
      const db = await this.initDB();
      if (!db) return;

      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      store.put(msg);
    } catch (e) {
      console.warn('Queue outbox error:', e);
    }
  }

  /**
   * Get all queued outbox messages
   */
  public async getOutboxMessages(): Promise<Message[]> {
    try {
      const db = await this.initDB();
      if (!db) return [];

      return new Promise((resolve) => {
        const tx = db.transaction('outbox', 'readonly');
        const store = tx.objectStore('outbox');
        const request = store.getAll();

        request.onsuccess = () => resolve((request.result as Message[]) || []);
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Clear outbox after successful sync
   */
  public async clearOutbox(): Promise<void> {
    try {
      const db = await this.initDB();
      if (!db) return;

      const tx = db.transaction('outbox', 'readwrite');
      tx.objectStore('outbox').clear();
    } catch (e) {
      console.warn('Clear outbox error:', e);
    }
  }

  /**
   * Clear cached messages for a deleted channel
   */
  public async clearCachedMessagesForChannel(channelId: string): Promise<void> {
    try {
      const db = await this.initDB();
      if (!db) return;

      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      const index = store.index('channelId');
      const request = index.getAllKeys(channelId);

      request.onsuccess = () => {
        const keys = request.result || [];
        keys.forEach((key) => store.delete(key));
      };
    } catch (e) {
      console.warn('Clear cached messages for channel error:', e);
    }
  }

  /**
   * Search offline message history
   */
  public async searchOfflineMessages(channelId: string, query: string): Promise<Message[]> {
    const all = await this.getCachedMessages(channelId);
    const q = query.toLowerCase();
    return all.filter((m) => m.content.toLowerCase().includes(q) || m.authorName.toLowerCase().includes(q));
  }
}

export const offlineStorage = new OfflineStorage();
