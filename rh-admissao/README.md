# Admissões (admissão por link)

App de RH separado do controle de estoque. O RH abre a admissão, o contratado manda os documentos pelo celular e o RH só consegue concluir quando não falta nada.

Baseado no módulo gratuito **"Admissão por link"** (Kairu/Nina, v1.0.0, código da Nina lido em 17/11/2026). O material serviu de referência; as regras foram adaptadas para este projeto.

> **Dados fictícios.** Tudo em `test/fixtures.json` e no seed (Maria Exemplo, Loja Centro, CPF 000.000.000-00) é inventado. Não use dados reais enquanto as etapas 3 a 6 e os testes de integração não estiverem prontos.

## Onde estamos

| Etapa | O que é | Situação |
|---|---|---|
| 1 | Banco de dados e migration | **Pronto** |
| 2 | Núcleo de regras (link, pendências, ASO, assinaturas, cancelar, concluir) com testes | **Pronto** |
| 3 | Abrir a admissão com jornada confirmada; mandar o link por e-mail e WhatsApp; lembretes e reenvio | A fazer |
| 4 | Formulário do candidato no celular: etapas, salvamento automático, fotos, envio único | A fazer |
| 5 | Tela do RH: ASO, contrato, regulamento, "o que ainda falta", documento por link temporário | A fazer |
| 6 | Concluir (pacote da contabilidade, funcionário, integrações) e cancelar (com exclusão de arquivos) | A fazer |

## Como rodar

Precisa de Node 22 e PostgreSQL 16.

```bash
npm install
cp .env.example .env   # ajuste DATABASE_URL
export DATABASE_URL="postgresql://USUARIO:SENHA@localhost:5432/rh_admissao"
npm run db:migrate     # aplica as migrations (prisma migrate deploy)
npm run db:seed        # só em banco de teste: carrega o exemplo fictício
npm test               # testes do núcleo (+ teste no banco se DATABASE_URL for local)
npm run dev            # http://localhost:3000
```

O teste de banco (`test/banco.test.ts`) só roda com `DATABASE_URL` em `localhost` e grava registros de teste que não podem ser apagados (a trilha é append-only). Use um banco descartável.

## O que já está garantido

**Banco (`prisma/schema.prisma` e `prisma/migrations/`)**
- Entidades do material: política da loja, admissão, link, arquivo, ASO (cada conferência é uma versão), dispensa do ASO, assinatura, evento e integração. Também loja, usuário e funcionário, que o projeto de estoque não tinha.
- O link guarda só o hash do token (único no banco).
- A trilha de eventos é append-only: o próprio banco recusa UPDATE e DELETE. A mesma `operacaoId` não grava duas vezes.
- Conferências no banco: salário maior que zero, motivo da dispensa com 10 ou mais caracteres e link que vence depois de criado.
- Dinheiro em centavos; admissão, exame e validade como data (dia civil da loja).

**Núcleo (`src/lib/admissao/nucleo.ts`)**
- Link de 7 dias exatos, uma finalidade só, reenvio revoga o anterior e recusa sempre com a mesma frase.
- Rascunho aceita só os campos do candidato (salário, loja e status nunca vêm do link), corta texto em 500 caracteres e 20 dependentes.
- Arquivo conferido pelo formato real dos bytes (JPEG, PNG, WebP e PDF; SVG e HTML recusados), até 15 MB por imagem e 5 MB por PDF.
- Lista do que trava a conclusão, igual ao material: documentos conforme a identidade, título, CTPS, comprovante, ASO, contrato e regulamento do setor.
- Dispensa do ASO só pelo dono ativo, com motivo, e nunca vale para ASO inapto.
- Concluir na ordem fixa: pacote, depois funcionário, depois integrações. Versão desatualizada é recusada, e dois cliques não criam duas pessoas.
- CPF inválido ou de funcionário ativo recebe a mesma mensagem genérica.

**Adaptações em relação à referência**
- Setores com regulamento, documentos extras do contador por tipo de contrato e prazo de anonimização são **configuração por loja** (`PoliticaAdmissao`).
- Token gerado com 32 bytes aleatórios (`gerarTokenBruto`).
- Regras de abertura no núcleo (`validarAbertura`): nome, celular, e-mail, CPF, data até 60 dias, data retroativa só para dono ou admin, jornada confirmada para a data e piso do cargo só como aviso.

**Testes:** 26 no total. Os 9 originais do material passam sem mudar nenhuma expectativa. Os outros 17 cobrem limites e as adaptações; 1 deles roda no PostgreSQL.

## Decisões pendentes (preciso de você)

1. **Documentos do contador:** o que ele exige além de CTPS, comprovante, título e identidade? Isso vira `documentosPorContrato` na política da loja.
2. **ASO:** qual clínica faz o exame e como o resultado chega?
3. **Regulamento de setor:** quais cargos assinam? O padrão é salão e cozinha.
4. **Jornada de cada cargo:** escala, horários, intervalo e cargas semanal e mensal.
5. **Janela retroativa:** o padrão está em 3 dias. Confirme com o contador.
6. **Prazo para anonimizar** uma admissão cancelada: o padrão está em 30 dias. O que a lei obriga a guardar, defina com o contador.

## Integrações pendentes

| Integração | Para quê | Situação |
|---|---|---|
| Hospedagem (VPS ou nuvem) + PostgreSQL | Deixar o app no ar | Não escolhida |
| Bucket privado compatível com S3 | Guardar documentos; abrir só por URL assinada de até 5 minutos | Não escolhido |
| Login do RH | Sessão, loja e permissões (inclusive saúde ocupacional para o ASO) | A fazer |
| E-mail | Mandar o link e os lembretes | Não escolhido |
| WhatsApp | Mandar o link e os lembretes | Não escolhido |
| Assinatura eletrônica | Contrato e regulamento (precisa de data, hash e envelope concluído) | Não escolhida |
| Portal, ponto, benefícios e chat | Fila após concluir; falha não desfaz a admissão | Não escolhidos |

## Limites

Este material não é orientação jurídica nem médica. Documentos exigidos, campos do eSocial e ASO dependem do contador e do serviço de medicina do trabalho. Contrato, experiência e jornada dependem da CLT e da convenção coletiva. Colete só o que o contrato, a folha e o eSocial pedem.
