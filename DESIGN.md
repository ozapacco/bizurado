# Design

Sistema visual do Bizurado. Direção definida em 2026-07: **"caderno de aprovado"** — light-first, editorial, legibilidade máxima para leitura de cards longos de lei.

> Estado atual do código: dark slate + ciano (defaults Tailwind, tokens em `app/globals.css`). Este documento descreve o sistema-alvo; a migração acontece superfície a superfície (tela de estudo primeiro, depois plano/trilha, por fim telas de dados).

## Color

Estratégia: **restrained** — papel quase branco levemente tingido do azul-petróleo da marca (continuidade com o ciano atual, escurecido para servir de tinta), um acento petróleo para ações, e a paleta semântica das notas de revisão. Sem gradientes decorativos.

### Tokens-alvo (OKLCH)

| Token | Valor | Papel |
|---|---|---|
| `--paper` | `oklch(0.985 0.004 210)` | Fundo do body — off-white tingido do hue da marca (não creme) |
| `--surface` | `oklch(0.962 0.006 210)` | Superfície de apoio (área do card, inputs, tabelas) |
| `--ink` | `oklch(0.24 0.03 220)` | Texto principal e títulos (≥ 12:1 sobre paper) |
| `--ink-soft` | `oklch(0.42 0.025 220)` | Texto secundário — ainda ≥ 4.5:1 sobre paper |
| `--line` | `oklch(0.88 0.008 210)` | Bordas e divisores |
| `--accent` | `oklch(0.48 0.09 215)` | Ações, links, seleção — petróleo (herda a identidade ciano) |
| `--accent-ink` | `oklch(0.985 0.004 210)` | Texto sobre accent |
| `--grade-again` | `oklch(0.50 0.16 25)` | Nota "errei" |
| `--grade-hard` | `oklch(0.55 0.12 70)` | Nota "difícil" |
| `--grade-good` | `oklch(0.48 0.09 215)` | Nota "bom" (mesma família do accent) |
| `--grade-easy` | `oklch(0.52 0.12 150)` | Nota "fácil" |

Regras:
- Cinza lavado nunca em corpo de texto: `--ink-soft` é o piso; abaixo disso só em labels grandes.
- Notas de revisão nunca comunicam só por cor — sempre com rótulo de texto (e atalho numérico visível).
- Um acento por tela: o CTA de continuar a trilha/revisão. Estados usam a paleta semântica, não decoração.

## Typography

| Papel | Fonte | Uso |
|---|---|---|
| Conteúdo do card + títulos | Source Serif 4 (`next/font`) | Enunciado e resposta dos flashcards, h1/h2 — a serifa carrega o "caderno" e a leitura longa |
| UI | Inter (`next/font`, carregar de verdade — hoje é citada e nunca importada) | Navegação, botões, labels, formulários |
| Dados | JetBrains Mono | Contadores, estatísticas, datas, "volta N" |

- Escala fixa em rem, razão ~1.2 (registro product; nada de clamp fluido).
- Texto do card: 1.125–1.25rem, linha 1.65, medida máx. 65–70ch, `text-wrap: pretty`.
- `text-wrap: balance` em h1–h2.

## Spacing & Layout

- Grid de 4px. Largura de leitura ~44rem para a área do card; telas de dados podem usar até 72rem.
- Tela de estudo: coluna única centrada, card generoso, barra de notas fixa ao alcance do polegar no mobile.
- Telas de dados (histórico, stats, disciplinas): densidade permitida, tabelas reais em vez de grid de cards idênticos (anti-referência).
- Raio padrão `rounded-lg`; sombra só `shadow-sm` em superfícies elevadas; sem glassmorphism.

## Components

- **Botões**: primário (accent sólido), secundário (outline `--line`), ghost. Estados completos: hover, focus visível, active, disabled, loading.
- **Notas de revisão**: 4 botões com rótulo + atalho (1 Errei · 2 Difícil · 3 Bom · 4 Fácil), cor semântica no detalhe (não no fundo inteiro), operáveis por teclado.
- **Progresso de volta**: barra fina + "Volta N · X de Y tópicos" em mono — a métrica-herói, presente na home, trilha e estudo.
- **Loading**: skeleton na área que vai receber o dado; nunca "Carregando..." em texto solto.
- **Vazios**: ensinam a próxima ação (ex.: "Plano de hoje concluído — próxima volta começa em…").

## Motion

- 150–250ms, ease-out. Motion só para estado: virar o card (crossfade curto), confirmação de nota, transição de tópico.
- Sem sequências de entrada orquestradas; o app carrega direto na tarefa.
- `prefers-reduced-motion: reduce` → trocas instantâneas.

## Voice & Copy

Vocabulário do estudo: volta, baralho, trilha, plano do dia, revisão. Erros dizem o que fazer ("Sem conexão com o banco — recarregue ou verifique a DATABASE_URL"). Números sempre com contexto ("142 cards hoje", nunca "142").
