-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('OWNER', 'ADMIN', 'MANAGER');

-- CreateEnum
CREATE TYPE "StatusFuncionario" AS ENUM ('ATIVO', 'DESLIGADO');

-- CreateEnum
CREATE TYPE "StatusAdmissao" AS ENUM ('PENDENTE', 'DOCS_RECEBIDOS', 'ESOCIAL', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoContrato" AS ENUM ('EXPERIENCIA_30_60', 'EXPERIENCIA_45_45', 'INDETERMINADO', 'APRENDIZ');

-- CreateEnum
CREATE TYPE "TipoIdentidade" AS ENUM ('RG_NOVO_CIN', 'CNH', 'RG_ANTIGO');

-- CreateEnum
CREATE TYPE "FinalidadeLink" AS ENUM ('PREENCHER_ADMISSAO', 'PRIMEIRO_ACESSO');

-- CreateEnum
CREATE TYPE "TipoArquivo" AS ENUM ('rg', 'cpf', 'cnh', 'ctps', 'comprovante', 'tituloEleitor', 'foto', 'aso', 'contrato', 'regulamento');

-- CreateEnum
CREATE TYPE "DocumentoAssinatura" AS ENUM ('CONTRATO', 'REGULAMENTO');

-- CreateEnum
CREATE TYPE "TipoIntegracao" AS ENUM ('PORTAL', 'PONTO', 'BENEFICIOS', 'CHAT');

-- CreateEnum
CREATE TYPE "StatusIntegracao" AS ENUM ('PENDENTE', 'OK', 'ERRO');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loja" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "permissoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funcionario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT,
    "cargo" TEXT NOT NULL,
    "funcao" TEXT NOT NULL,
    "dataAdmissao" DATE NOT NULL,
    "status" "StatusFuncionario" NOT NULL DEFAULT 'ATIVO',
    "admissaoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliticaAdmissao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "documentosPorContrato" JSONB NOT NULL DEFAULT '{}',
    "setoresComRegulamento" TEXT[] DEFAULT ARRAY['SALAO', 'COZINHA']::TEXT[],
    "janelaFolhaDiaInicio" INTEGER NOT NULL DEFAULT 1,
    "janelaFolhaDiaFim" INTEGER NOT NULL DEFAULT 25,
    "prazoAnonimizarDias" INTEGER NOT NULL DEFAULT 30,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoliticaAdmissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admissao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "StatusAdmissao" NOT NULL DEFAULT 'PENDENTE',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "email" TEXT,
    "cpf" TEXT,
    "cargo" TEXT NOT NULL,
    "funcao" TEXT NOT NULL,
    "setor" TEXT NOT NULL,
    "salarioCentavos" INTEGER NOT NULL,
    "tipoContrato" "TipoContrato" NOT NULL,
    "dataAdmissao" DATE NOT NULL,
    "jornada" JSONB NOT NULL,
    "dadosCandidato" JSONB NOT NULL DEFAULT '{}',
    "tipoIdentidade" "TipoIdentidade",
    "preenchidoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "canceladoEm" TIMESTAMP(3),
    "canceladoPor" TEXT,
    "motivo" TEXT,
    "anonimizarEm" TIMESTAMP(3),
    "anonimizadoEm" TIMESTAMP(3),
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkAdmissao" (
    "id" TEXT NOT NULL,
    "admissaoId" TEXT NOT NULL,
    "finalidade" "FinalidadeLink" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),

    CONSTRAINT "LinkAdmissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArquivoAdmissao" (
    "id" TEXT NOT NULL,
    "admissaoId" TEXT NOT NULL,
    "tipo" "TipoArquivo" NOT NULL,
    "chave" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "apagadoEm" TIMESTAMP(3),

    CONSTRAINT "ArquivoAdmissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsoAdmissao" (
    "id" TEXT NOT NULL,
    "admissaoId" TEXT NOT NULL,
    "arquivoId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "dataExame" DATE NOT NULL,
    "dataValidade" DATE,
    "apto" BOOLEAN NOT NULL,
    "conferidoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsoAdmissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispensaAso" (
    "id" TEXT NOT NULL,
    "admissaoId" TEXT NOT NULL,
    "autorizadoPor" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogadaEm" TIMESTAMP(3),

    CONSTRAINT "DispensaAso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assinatura" (
    "id" TEXT NOT NULL,
    "admissaoId" TEXT NOT NULL,
    "documento" "DocumentoAssinatura" NOT NULL,
    "arquivoId" TEXT,
    "revisaoAtual" INTEGER NOT NULL DEFAULT 1,
    "revisaoAssinada" INTEGER,
    "envelopeStatus" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "assinadoEm" TIMESTAMP(3),
    "hashAssinatura" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoAdmissao" (
    "id" TEXT NOT NULL,
    "admissaoId" TEXT NOT NULL,
    "operacaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ator" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoAdmissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoAdmissao" (
    "id" TEXT NOT NULL,
    "admissaoId" TEXT NOT NULL,
    "tipo" "TipoIntegracao" NOT NULL,
    "status" "StatusIntegracao" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimoErro" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracaoAdmissao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loja_tenantId_id_key" ON "Loja"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Usuario_tenantId_storeId_idx" ON "Usuario"("tenantId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_tenantId_email_key" ON "Usuario"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_admissaoId_key" ON "Funcionario"("admissaoId");

-- CreateIndex
CREATE INDEX "Funcionario_tenantId_cpf_idx" ON "Funcionario"("tenantId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "PoliticaAdmissao_tenantId_storeId_key" ON "PoliticaAdmissao"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "Admissao_tenantId_storeId_status_idx" ON "Admissao"("tenantId", "storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LinkAdmissao_tokenHash_key" ON "LinkAdmissao"("tokenHash");

-- CreateIndex
CREATE INDEX "LinkAdmissao_admissaoId_finalidade_idx" ON "LinkAdmissao"("admissaoId", "finalidade");

-- CreateIndex
CREATE UNIQUE INDEX "ArquivoAdmissao_chave_key" ON "ArquivoAdmissao"("chave");

-- CreateIndex
CREATE INDEX "ArquivoAdmissao_admissaoId_tipo_idx" ON "ArquivoAdmissao"("admissaoId", "tipo");

-- CreateIndex
CREATE INDEX "AsoAdmissao_admissaoId_criadoEm_idx" ON "AsoAdmissao"("admissaoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_admissaoId_documento_key" ON "Assinatura"("admissaoId", "documento");

-- CreateIndex
CREATE UNIQUE INDEX "EventoAdmissao_operacaoId_key" ON "EventoAdmissao"("operacaoId");

-- CreateIndex
CREATE INDEX "EventoAdmissao_admissaoId_criadoEm_idx" ON "EventoAdmissao"("admissaoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoAdmissao_admissaoId_tipo_key" ON "IntegracaoAdmissao"("admissaoId", "tipo");

-- AddForeignKey
ALTER TABLE "Loja" ADD CONSTRAINT "Loja_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkAdmissao" ADD CONSTRAINT "LinkAdmissao_admissaoId_fkey" FOREIGN KEY ("admissaoId") REFERENCES "Admissao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArquivoAdmissao" ADD CONSTRAINT "ArquivoAdmissao_admissaoId_fkey" FOREIGN KEY ("admissaoId") REFERENCES "Admissao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsoAdmissao" ADD CONSTRAINT "AsoAdmissao_admissaoId_fkey" FOREIGN KEY ("admissaoId") REFERENCES "Admissao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispensaAso" ADD CONSTRAINT "DispensaAso_admissaoId_fkey" FOREIGN KEY ("admissaoId") REFERENCES "Admissao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_admissaoId_fkey" FOREIGN KEY ("admissaoId") REFERENCES "Admissao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAdmissao" ADD CONSTRAINT "EventoAdmissao_admissaoId_fkey" FOREIGN KEY ("admissaoId") REFERENCES "Admissao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoAdmissao" ADD CONSTRAINT "IntegracaoAdmissao_admissaoId_fkey" FOREIGN KEY ("admissaoId") REFERENCES "Admissao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== Regras que o Prisma não gera (adicionadas à mão) =====

-- Trilha de eventos append-only: UPDATE e DELETE são recusados no banco.
CREATE FUNCTION evento_admissao_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EventoAdmissao é append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evento_admissao_sem_update_delete
  BEFORE UPDATE OR DELETE ON "EventoAdmissao"
  FOR EACH ROW EXECUTE FUNCTION evento_admissao_append_only();

-- Conferências simples no banco, além das do servidor.
ALTER TABLE "Admissao" ADD CONSTRAINT "Admissao_salario_positivo" CHECK ("salarioCentavos" > 0);
ALTER TABLE "Admissao" ADD CONSTRAINT "Admissao_versao_positiva" CHECK ("versao" >= 1);
ALTER TABLE "ArquivoAdmissao" ADD CONSTRAINT "ArquivoAdmissao_tamanho_positivo" CHECK ("tamanho" > 0);
ALTER TABLE "LinkAdmissao" ADD CONSTRAINT "LinkAdmissao_expira_depois" CHECK ("expiraEm" > "criadoEm");
ALTER TABLE "DispensaAso" ADD CONSTRAINT "DispensaAso_motivo_10" CHECK (char_length(btrim("motivo")) >= 10);
