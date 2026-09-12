/**
 * Braza Talk — Script de Migração de Mensagens Legadas
 *
 * Migra documentos da coleção raiz `/messages` para a subcoleção
 * `servers/{serverId}/channels/{channelId}/messages/{messageId}`.
 *
 * Execução:
 *   npx tsx scripts/migrate-legacy-messages.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  console.log('Iniciando verificação de mensagens legadas em /messages...');

  let config: any = {};
  const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }

  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId || undefined);

  try {
    const rootMessagesRef = collection(db, 'messages');
    const snap = await getDocs(rootMessagesRef);

    if (snap.empty) {
      console.log('✅ Nenhuma mensagem pendente em /messages. Base já está limpa e no formato novo.');
      process.exit(0);
    }

    console.log(`Encontradas ${snap.size} mensagens na coleção raiz /messages.`);

    // Map channels to serverId
    const serversSnap = await getDocs(collection(db, 'servers'));
    const channelToServerMap: Record<string, string> = {};
    serversSnap.forEach((docSnap) => {
      const srv = docSnap.data() as any;
      if (srv.channels && Array.isArray(srv.channels)) {
        srv.channels.forEach((ch: any) => {
          if (ch?.id) channelToServerMap[ch.id] = srv.id;
        });
      }
    });

    let migrated = 0;
    let errors = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data() as any;
      const msgId = docSnap.id;
      const channelId = data.channelId;
      const targetServerId = data.serverId || channelToServerMap[channelId] || 'server-braza-community';

      if (!channelId) {
        console.warn(`[Skip] Mensagem ${msgId} sem channelId.`);
        errors++;
        continue;
      }

      try {
        const targetRef = doc(db, 'servers', targetServerId, 'channels', channelId, 'messages', msgId);
        await setDoc(targetRef, { ...data, serverId: targetServerId, channelId });
        await deleteDoc(docSnap.ref);
        migrated++;
      } catch (err: any) {
        console.error(`[Erro] Mensagem ${msgId}:`, err?.message || err);
        errors++;
      }
    }

    console.log(`🎉 Migração concluída: ${migrated} migradas, ${errors} erros.`);
  } catch (err: any) {
    console.error('Falha ao executar migração:', err?.message || err);
  }
}

runMigration();
