# Product

## Register

product

## Platform

web

## Users

Um único usuário: o próprio dono do projeto, estudando pesado para concurso público (Direito, Português, Matemática e afins). Sessões longas e diárias de revisão — dezenas de milhares de flashcards (44.908 cards, 8 disciplinas) organizados em trilha por tópicos. O contexto é foco total: quando abre o app, quer entrar na revisão em segundos e ler enunciados longos de lei sem fadiga. Não há segunda audiência — nada de marketing, onboarding público ou multiusuário.

## Product Purpose

Sistema pessoal de estudo por flashcards com repetição espaçada (FSRS) e trilha de ciclos por tópico. O trabalho a ser feito: cumprir o plano do dia, avançar na trilha e acumular "voltas no baralho" — a métrica-herói do progresso. Sucesso é sentar, revisar sem fricção e sair sabendo exatamente onde parou e quanto falta.

## Positioning

O caderno definitivo do aprovado: todo o edital em cards, numa volta atrás da outra, sem o usuário precisar decidir nada além de "continuar".

## Brand Personality

Caderno de estudo sério e acolhedor: claro, editorial, silencioso. A sofisticação vem da tipografia e do respiro, não de efeitos. Tom direto em português, vocabulário de estudo (volta, baralho, trilha, plano do dia) — nunca jargão de dashboard.

## Anti-references

- Dashboard SaaS genérico: grid de cards idênticos com número grande + label, gradientes decorativos, cara de template de admin.
- App de gamificação fofo (Duolingo-like): mascotes, confete, badges, XP piscando. Estudo de concurso é sério.
- Anki cru: utilitário sem design, botões default, tela branca crua — funcional mas sem prazer de usar.

## Design Principles

1. **Ler é a tarefa nº 1** — cards de lei são texto longo; legibilidade (contraste, medida de linha, serifa no conteúdo) vence qualquer decoração.
2. **Uma decisão por tela** — a tela de estudo pergunta uma coisa (lembrou ou não); o resto do app existe para levar até ela em um clique.
3. **Progresso sempre visível, nunca gritado** — a volta atual e o plano do dia aparecem em todo contexto relevante, em tom de caderno, não de placar.
4. **O app desaparece na tarefa** — componentes familiares, motion 150–250ms só para estado, zero cerimônia de carregamento.
5. **Denso onde ajuda, calmo onde lê** — tabelas e histórico podem ser densos; a área do card é sempre generosa.

## Accessibility & Inclusion

WCAG 2.1 AA como alvo prático: contraste ≥ 4.5:1 no corpo (inclusive texto de cards sobre fundo claro), foco visível por teclado (a revisão deve ser 100% operável por teclado — atalhos 1/2/3/4 para as notas), `prefers-reduced-motion` respeitado. Sessões longas: evitar branco puro estourado e cinzas lavados que cansam a vista.
