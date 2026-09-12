/**
 * Braza Talk — Script de Migração e Limpeza de Mensagens Legadas
 *
 * Migra documentos da coleção raiz `/messages` para as subcoleções
 * `servers/{serverId}/channels/{channelId}/messages/{messageId}`.
 *
 * Suporta dois modos de autenticação administrativa:
 * 1. Firebase Admin SDK (Recomendado):
 *    Coloque 'service-account.json' na raiz do projeto ou defina GOOGLE_APPLICATION_CREDENTIALS.
 * 2. Firebase Client SDK autenticado como administrador:
 *    Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env ou passe como argumentos.
 *
 * Opções de linha de comando:
 *   --dry-run      Apenas analisa e imprime o mapeamento de mensagens sem alterar o banco
 *   --purge-only   Exclui as mensagens legadas em /messages sem migrá-las (descarte consciente)
 *   --batch-size=N Tamanho do lote (padrão: 200)
 *
 * Exemplos:
 *   npx tsx scripts/migrate-legacy-messages.ts --dry-run
 *   npx tsx scripts/migrate-legacy-messages.ts
 *   npx tsx scripts/migrate-legacy-messages.ts --purge-only
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isPurgeOnly = args.includes('--purge-only');

function getServiceAccountPath(): string | null {
  const possiblePaths = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(process.cwd(), 'service-account.json'),
    path.join(process.cwd(), 'service-account-key.json'),
    path.join(process.cwd(), 'serviceAccountKey.json'),
  ].filter(Boolean) as string[];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getAppletConfig(): any {
  const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
  return {};
}

async function runWithAdminSdk(serviceAccountPath: string) {
  console.log(`[Admin SDK] Utilizando credenciais de serviço de: ${serviceAccountPath}`);
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  const config = getAppletConfig();

  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id || config.projectId,
  });

  const db = config.firestoreDatabaseId
    ? getFirestore(app, config.firestoreDatabaseId)
    : getFirestore(app);

  await executeMigration({
    isDryRun,
    isPurgeOnly,
    fetchMessages: async () => {
      const snap = await db.collection('messages').get();
      return snap.docs.map((d: any) => ({ id: d.id, data: d.data(), ref: d.ref }));
    },
    fetchServers: async () => {
      const snap = await db.collection('servers').get();
      return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    },
    batchMigrate: async (operations) => {
      let batch = db.batch();
      let count = 0;
      for (const op of operations) {
        if (op.type === 'migrate') {
          const targetRef = db
            .collection('servers')
            .doc(op.serverId)
            .collection('channels')
            .doc(op.channelId)
            .collection('messages')
            .doc(op.msgId);
          batch.set(targetRef, op.data);
          batch.delete(op.ref);
          count += 2;
        } else if (op.type === 'delete') {
          batch.delete(op.ref);
          count += 1;
        }

        if (count >= 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    },
  });
}

async function runWithClientSdk() {
  console.log('[Client SDK] Verificando autenticação de administrador...');
  const { initializeApp } = await import('firebase/app');
  const {
    getFirestore,
    collection,
    getDocs,
    doc,
    writeBatch,
  } = await import('firebase/firestore');
  const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');

  const config = getAppletConfig();
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app, config.firestoreDatabaseId || undefined);

  const email = process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(`
❌ ERRO DE AUTENTICAÇÃO ADMINISTRATIVA:
Para rodar a migração das mensagens legadas (/messages), é necessário acesso de administrador porque as regras do Firestore protegem a coleção raiz contra leitura anônima.

Por favor, escolha UMA das opções abaixo:

Opção 1 (Recomendada):
  Baixe a chave de conta de serviço no Console do Firebase (Configurações do Projeto -> Contas de Serviço)
  e salve-a como 'service-account.json' na raiz deste projeto.

Opção 2:
  Defina as credenciais de um usuário administrador no arquivo .env:
    ADMIN_EMAIL=megaronp@gmail.com
    ADMIN_PASSWORD=sua_senha_aqui

Em seguida, execute novamente:
  npm run migrate:messages
`);
    process.exit(1);
  }

  console.log(`[Client SDK] Autenticando como ${email}...`);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ Autenticado com sucesso como administrador.');
  } catch (authErr: any) {
    console.error('❌ Falha ao autenticar administrador:', authErr?.message || authErr);
    process.exit(1);
  }

  await executeMigration({
    isDryRun,
    isPurgeOnly,
    fetchMessages: async () => {
      const snap = await getDocs(collection(db, 'messages'));
      return snap.docs.map((d) => ({ id: d.id, data: d.data(), ref: d.ref }));
    },
    fetchServers: async () => {
      const snap = await getDocs(collection(db, 'servers'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    batchMigrate: async (operations) => {
      let batch = writeBatch(db);
      let count = 0;
      for (const op of operations) {
        if (op.type === 'migrate') {
          const targetRef = doc(
            db,
            'servers',
            op.serverId,
            'channels',
            op.channelId,
            'messages',
            op.msgId
          );
          batch.set(targetRef, op.data);
          batch.delete(op.ref);
          count += 2;
        } else if (op.type === 'delete') {
          batch.delete(op.ref);
          count += 1;
        }

        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    },
  });
}

interface MigrationExecutor {
  isDryRun: boolean;
  isPurgeOnly: boolean;
  fetchMessages: () => Promise<Array<{ id: string; data: any; ref: any }>>;
  fetchServers: () => Promise<Array<any>>;
  batchMigrate: (operations: any[]) => Promise<void>;
}

async function executeMigration({
  isDryRun,
  isPurgeOnly,
  fetchMessages,
  fetchServers,
  batchMigrate,
}: MigrationExecutor) {
  console.log('\n--- Consultando documentos da coleção raiz /messages ---');
  let messages: Array<{ id: string; data: any; ref: any }> = [];
  try {
    messages = await fetchMessages();
  } catch (err: any) {
    console.error('❌ Falha ao listar mensagens de /messages:', err?.message || err);
    process.exit(1);
  }

  if (messages.length === 0) {
    console.log('✅ Nenhuma mensagem pendente em /messages. A coleção raiz já está vazia.');
    process.exit(0);
  }

  console.log(`Encontradas ${messages.length} mensagens na coleção legada.`);

  if (isPurgeOnly) {
    console.log(`⚠️ Modo --purge-only ativo. ${messages.length} mensagens serão excluídas da raiz.`);
    if (isDryRun) {
      console.log('🔍 [DRY-RUN] Nenhuma exclusão foi realizada no banco.');
      process.exit(0);
    }
    const ops = messages.map((m) => ({ type: 'delete', ref: m.ref }));
    await batchMigrate(ops);
    console.log(`✅ ${messages.length} mensagens órfãs excluídas com sucesso da raiz.`);
    process.exit(0);
  }

  console.log('Mapeando servidores e canais...');
  const servers = await fetchServers();
  const channelToServerMap: Record<string, string> = {};
  for (const srv of servers) {
    if (srv.channels && Array.isArray(srv.channels)) {
      for (const ch of srv.channels) {
        if (ch?.id) channelToServerMap[ch.id] = srv.id;
      }
    }
  }

  let readyToMigrate: any[] = [];
  let unmappedCount = 0;

  for (const m of messages) {
    const data = m.data;
    const channelId = data.channelId;
    const explicitServerId = data.serverId;
    const targetServerId = explicitServerId || (channelId ? channelToServerMap[channelId] : undefined);

    if (!channelId || !targetServerId) {
      console.warn(
        `⚠️ [Orphan/Ignorada] Mensagem ID: ${m.id} | Canal: ${channelId || 'N/A'} | Servidor: não encontrado. Ignorada para prevenir vazamento.`
      );
      unmappedCount++;
      continue;
    }

    readyToMigrate.push({
      type: 'migrate',
      msgId: m.id,
      channelId,
      serverId: targetServerId,
      data: {
        ...data,
        channelId,
        serverId: targetServerId,
      },
      ref: m.ref,
    });
  }

  console.log(`\nResumo da análise:`);
  console.log(`- Total de mensagens em /messages: ${messages.length}`);
  console.log(`- Prontas para migrar: ${readyToMigrate.length}`);
  console.log(`- Órfãs / Sem servidor correspondente: ${unmappedCount}`);

  if (isDryRun) {
    console.log('\n🔍 [DRY-RUN CONCLUÍDO] Nenhuma gravação ou exclusão foi feita no banco.');
    console.log('Para executar a migração de fato, rode o script sem o parâmetro --dry-run.');
    process.exit(0);
  }

  if (readyToMigrate.length === 0) {
    console.log('Nenhuma mensagem elegível para migração.');
    process.exit(0);
  }

  console.log(`\nExecutando migração em lotes...`);
  await batchMigrate(readyToMigrate);
  console.log(`🎉 Migração concluída com sucesso! ${readyToMigrate.length} mensagens migradas e removidas da raiz.`);
}

async function main() {
  const saPath = getServiceAccountPath();
  if (saPath) {
    await runWithAdminSdk(saPath);
  } else {
    await runWithClientSdk();
  }
}

main().catch((e) => {
  console.error('Erro fatal durante a migração:', e);
  process.exit(1);
});
