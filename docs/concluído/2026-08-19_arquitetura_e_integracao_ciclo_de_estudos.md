# Relatório de Integração e Arquitetura: Ciclo de Estudos + Bizurado

**Data**: 19 de agosto de 2026  
**Status**: CONCLUÍDO e HOMOLOGADO

---

## 1. Motivação e Diagnóstico
A tentativa de integração anterior resultou em uma arquitetura inconsistente (uma "salada de frutas"), onde pedaços reescritos do Ciclo de Estudos foram forçados para dentro do layout do Bizurado, comprometendo a integridade dos tipos, das páginas e das camadas de persistência.

Nesta etapa, o projeto foi totalmente reestruturado sob a seguinte premissa:
> **O Ciclo de Estudos é o produto/host principal (layout, navegação, engines de ciclo e camadas). O Bizurado fornece os flashcards (repetição espaçada FSRS 4.5 e base de 44.908 cards) como uma funcionalidade integrada dentro dele.**

---

## 2. Checklist de Atualizações

- [x] **Reversão Completa**: Retorno do repositório local ao commit estável `d3dda29` do Bizurado.
- [x] **Instalação de Dependências**: Adicionados os pacotes necessários do Ciclo de Estudos (`lucide-react`, `date-fns`, `clsx`, `tailwind-merge`) ao `package.json`.
- [x] **Engine Porting (Sem Modificações)**: Cópia literal dos 8 engines de lógica de ciclo de `Ciclo-de-Estudos/src/lib/` para `BIZURADO/lib/preparation/`, ajustando apenas as referências de tipos relativos.
- [x] **Separação de Bancos de Dados**:
  - A preparação do Ciclo de Estudos continua usando a camada local-first isolada (`localStorage`) via `lib/preparation/db.ts`.
  - Os flashcards do Bizurado continuam rodando no IndexedDB com sincronização automática e persistência no Neon Postgres (`lib/db.ts`).
- [x] **Sidebar Layout Principal**: A navegação superior do Bizurado foi removida. A interface padrão agora é a **Sidebar Lateral Desktop** e **Bottom Nav Mobile** do Ciclo de Estudos (`components/Layout.tsx`).
- [x] **Home Unificada ("Hoje")**: O dashboard `/` agora exibe o ciclo operacional diário, com a prescrição direta do que estudar no momento (FAÇA AGORA) e um banner inteligente que integra e avisa se há flashcards vencidos para revisar hoje.
- [x] **Rotas em Português (Next.js App Router)**:
  - `/` -> Dashboard Hoje (Ciclo + Integração Flashcards)
  - `/ciclo` -> Fila circular de disciplinas
  - `/disciplinas` -> Planilha expansível de progresso e 5 passagens de camada
  - `/questoes` -> Painel de registros de questões por grupo (A, B, C, D)
  - `/progresso` -> Estatísticas e avanços da camada ativa
  - `/configuracoes` -> Gerenciador de metas (PF, PRF, PCSC, etc.) com Wizard modal
  - `/estudar` -> Cronômetro da sessão do ciclo ativo
- [x] **Integração de Links de Estudo**:
  - Na página expansível `/disciplinas`, os assuntos do ciclo são mapeados para os baralhos de flashcards locais. Se houver correspondência, um botão direto "Estudar" direciona o usuário para a rota de flashcards (`/study?topicId=...`).
- [x] **Verificação de Build**: Comando `npm run build` executado e compilado com sucesso sem avisos ou erros.
- [x] **Sincronização com GitHub**: Commits enviados com sucesso para os remotes `origin` e `ozapacco`.

---

## 3. Estrutura de Arquivos Portados

```text
C:\Dev\BIZURADO
├── app/
│   ├── layout.tsx         # Configuração dos fontes e envelopamento no sidebar layout
│   ├── page.tsx           # Home "Hoje" com indicação de estudo e flashcards pendentes
│   ├── ciclo/page.tsx     # Fila circular e edição manual de tempos
│   ├── disciplinas/page.tsx # Planilha de progresso e links para flashcards
│   ├── estudar/page.tsx   # Painel de estudo ativo com cronômetro e registro de questões
│   ├── progresso/page.tsx # Métricas de desempenho na camada atual
│   ├── configuracoes/page.tsx # Painel de alvos de edital e wizard
│   └── questoes/page.tsx  # Histórico de acertos por grupo de bateria
├── components/
│   ├── Layout.tsx         # Sidebar Desktop / Bottom Nav Mobile e SyncManager
│   ├── AddGoalWizardModal.tsx # Seletor de carreira, órgão, cargo e prioridade
│   └── VerticalSyllabusModal.tsx # Visualizador de edital ativo verticalizado
└── lib/preparation/       # Motores de lógica puros do Ciclo de Estudos
    ├── db.ts              # Acesso ao localStorage isolado
    ├── cycle.ts           # Progresso do ciclo
    ├── types.ts           # Definições de tipo da preparação
    ├── layerEngine.ts     # Gerenciamento de passagem pelas 5 camadas
    ├── sessionEngine.ts   # Prescrição de atividades (FAÇA AGORA)
    └── consolidatedPlanEngine.ts # Consolidação de editais múltiplos
```
