// Config padrão da sincronização em nuvem — EMBUTIDA no app de propósito.
//
// POR QUE ISSO EXISTE (leia antes de mexer):
// A config do Firebase morava só no localStorage, digitada pelo usuário. O
// problema: é o MESMO localStorage que some quando ele limpa os dados do
// navegador. Ou seja, a chave pra alcançar a nuvem era apagada junto com os
// dados — e depois de limpar, o app abria em branco, sem conseguir nem
// descobrir onde estavam os dados que continuavam salvos na nuvem. O usuário
// teria que redigitar 6 campos que provavelmente não tem guardados em lugar
// nenhum.
//
// Com a config aqui no código, depois de limpar tudo o fluxo vira:
// abrir o app -> tocar em "Entrar com Google" -> tudo volta sozinho. Um
// toque, e só porque é preciso provar a identidade (a sessão do Google
// também é apagada na limpeza). Esse é o mínimo inevitável.
//
// ISSO NÃO É SEGREDO. A config web do Firebase é pública por design — ela
// identifica o projeto, não autoriza nada. Quem protege os dados são as
// Regras de Segurança do Firestore, que devem travar o acesso ao dono:
//
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /users/{userId}/{document=**} {
//         allow read, write: if request.auth != null
//                            && request.auth.uid == userId;
//       }
//     }
//   }
//
// Com essa regra, mesmo o repositório sendo público, cada conta Google só
// enxerga o próprio espaço — ninguém lê nem escreve nos dados de outro.
//
// O usuário continua podendo apontar o app pro projeto Firebase dele pela
// tela de Configurações; o que estiver salvo no aparelho tem prioridade
// sobre o que está aqui (ver getConfig() em js/sync.js).

(function () {
  window.PdmSyncDefaults = {
    apiKey: 'AIzaSyDisqab9qW2hLWELvUBkt-gNOD_LJTxMWs',
    authDomain: 'myjourney-a3942.firebaseapp.com',
    projectId: 'myjourney-a3942',
    storageBucket: 'myjourney-a3942.firebasestorage.app',
    messagingSenderId: '390236176052',
    appId: '1:390236176052:web:4b17925b07d8b35c7921e1',
  };
})();
