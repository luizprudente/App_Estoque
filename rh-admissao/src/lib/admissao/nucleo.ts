// Núcleo puro da admissão por link (sem banco, sem rede).
// Adaptado do reference.mjs do módulo "Admissão por link" (Kairu/Nina, v1.0.0).
// Diferenças em relação à referência:
//  - setores com regulamento, documentos extras do contador e prazo de anonimização vêm da política da loja;
//  - gerarTokenBruto() cria os 32 bytes aleatórios exigidos;
//  - validarAbertura() aplica as regras de abertura (nome, celular, e-mail, CPF, data, jornada);
//  - a dispensa do ASO exige dono ATIVO;
//  - conferirCpfDoCandidato() junta dígito verificador e duplicidade numa resposta genérica.
// O backend continua responsável por: sessão, escopo por loja, versão otimista, locks, bucket privado e trilha de eventos.
import { createHash, randomBytes } from "node:crypto";

// ---------- Tipos ----------
export type Papel = "OWNER" | "ADMIN" | "MANAGER";
export type Status = "PENDENTE" | "DOCS_RECEBIDOS" | "ESOCIAL" | "CONCLUIDO" | "CANCELADO";
export type Finalidade = "PREENCHER_ADMISSAO" | "PRIMEIRO_ACESSO";
export type TipoIdentidade = "RG_NOVO_CIN" | "CNH" | "RG_ANTIGO";
export type TipoDoc = "rg" | "cpf" | "cnh" | "ctps" | "comprovante" | "tituloEleitor" | "foto";
export type Integracao = "PORTAL" | "PONTO" | "BENEFICIOS" | "CHAT";

export interface Ator {
  id: string;
  tenantId: string;
  storeId: string;
  papel: Papel;
  permissoes?: string[];
  ativo?: boolean;
}

export interface Jornada {
  tipoEscala?: string;
  entrada?: string;
  saida?: string;
  intervaloMin?: number;
  cargaSemanal?: number;
  horasMensais?: string;
  folgas?: string[];
  domingoACada?: number;
  fonteConfirmacao?: string;
  confirmadaEm?: string | null;
  confirmadaParaData?: string;
}

export interface Aso {
  arquivoId: string;
  dataExame: string;
  dataValidade?: string | null;
  apto: boolean;
  sha256: string;
  conferidoPor?: string;
}

export interface DispensaAso {
  autorizadoPor: string;
  papel: Papel;
  motivo: string;
  em?: string;
  revogadaEm?: string | null;
}

export interface AssinaturaDoc {
  arquivoId?: string;
  revisaoAtual: number;
  revisaoAssinada: number | null;
  assinadoEm: string | null;
  hashAssinatura: string | null;
  envelopeStatus: string;
}

// Forma em memória da admissão. A camada de banco monta este objeto a partir das tabelas.
export interface Admissao {
  id: string;
  tenantId: string;
  storeId: string;
  status: Status;
  versao: number;
  nome: string;
  cargo: string;
  funcao: string;
  setor: string;
  salarioCentavos: number;
  tipoContrato: string;
  dataAdmissao: string; // AAAA-MM-DD, dia civil da loja
  jornada: Jornada | null;
  cpf?: string | null;
  tipoIdentidade?: TipoIdentidade | null;
  identidade?: Record<string, unknown>;
  tituloEleitor?: Record<string, unknown>;
  documentos?: Partial<Record<TipoDoc, string[]>>;
  aso?: Aso | null;
  asoDispensa?: DispensaAso | null;
  assinaturas?: { contrato?: AssinaturaDoc; regulamento?: AssinaturaDoc };
  preenchidoEm?: string | null;
  [campo: string]: unknown;
}

export interface Link {
  id: string;
  admissaoId: string;
  finalidade: Finalidade;
  tokenHash: string;
  criadoEm: string;
  expiraEm: string;
  usadoEm: string | null;
  revogadoEm: string | null;
}
export type LinkComAdmissao = Link & { admissao: Admissao };

export interface Pendencia {
  chave: string;
  texto: string;
}

export type Armazenamento = Record<string, { tipo: string; sha256: string }>;

// Política da loja: o que na Nina é código, aqui é configuração.
export interface Politica {
  setoresComRegulamento: string[];
  nomesSetor: Record<string, string>;
  // Documentos exigidos além dos sempre exigidos, por tipo de contrato (lista do contador).
  documentosPorContrato: Record<string, TipoDoc[]>;
  prazoAnonimizarDias: number;
  diasRetroativosPermitidos: number;
  diasFuturosPermitidos: number;
}

export const POLITICA_PADRAO: Politica = {
  setoresComRegulamento: ["SALAO", "COZINHA"],
  nomesSetor: { SALAO: "Salão", COZINHA: "Cozinha" },
  documentosPorContrato: {},
  prazoAnonimizarDias: 30,
  diasRetroativosPermitidos: 3, // "janela curta": confirmar com o contador
  diasFuturosPermitidos: 60,
};

// ---------- Constantes ----------
export const VALIDADE_LINK_DIAS = 7;
export const VALIDADE_PRIMEIRO_ACESSO_HORAS = 48;
export const MENSAGEM_LINK_RECUSADO = "Este link não está mais válido. Peça um novo ao RH da loja.";
export const MENSAGEM_CPF_INDISPONIVEL = "Não conseguimos seguir com este CPF. Confira o número ou fale com o RH da loja.";
export const INTEGRACOES: Integracao[] = ["PORTAL", "PONTO", "BENEFICIOS", "CHAT"];
export const TIPOS_DOC: TipoDoc[] = ["rg", "cpf", "cnh", "ctps", "comprovante", "tituloEleitor", "foto"];
// Campos que o candidato pode gravar pelo link. Salário, cargo, loja e status nunca vêm do link.
export const CAMPOS_DO_CANDIDATO = [
  "cpf", "dataNascimento", "email", "estadoCivil", "escolaridade", "racaCor", "nacionalidade", "endereco", "banco",
  "emergencia", "tipoIdentidade", "identidade", "tituloEleitor", "ctps", "pis", "primeiroEmprego", "dependentes",
] as const;
const NOME_DOC: Record<TipoDoc, string> = {
  rg: "Foto do RG", cpf: "Foto do CPF", cnh: "Foto da CNH", ctps: "CTPS", comprovante: "Comprovante de residência",
  tituloEleitor: "Título de eleitor", foto: "Foto 3x4",
};
const MIME_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
const DIA = 86_400_000, HORA = 3_600_000, MB = 1024 * 1024;
const FLUXO: Record<Status, Status[]> = {
  PENDENTE: ["DOCS_RECEBIDOS", "CANCELADO"],
  DOCS_RECEBIDOS: ["ESOCIAL", "CONCLUIDO", "CANCELADO"],
  ESOCIAL: ["CONCLUIDO", "CANCELADO"],
  CONCLUIDO: [],
  CANCELADO: [],
};

export class ErroAdmissao extends Error {}
const fail = (m: string): never => { throw new ErroAdmissao(m); };
const texto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
export const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const temArquivo = (v: unknown) => Array.isArray(v) && v.length > 0;
export const hashToken = (t: string) => createHash("sha256").update(String(t)).digest("hex");
const cortar = (v: unknown): unknown =>
  typeof v === "string" ? v.slice(0, 500)
  : v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === "string" ? x.slice(0, 500) : x]))
    : v;
export const podeIr = (de: Status, para: Status) => !!FLUXO[de]?.includes(para);

// Outra loja ou outro tenant responde igual a "não existe".
function exigirEscopo(ator: Ator | null | undefined, a: Pick<Admissao, "tenantId" | "storeId">, papeis: Papel[] = ["OWNER", "ADMIN", "MANAGER"]) {
  if (!ator || ator.tenantId !== a.tenantId || ator.storeId !== a.storeId) fail("admissão não encontrada");
  if (ator!.ativo === false || !papeis.includes(ator!.papel)) fail("sem permissão");
}

// ---------- Token e link ----------

// 32 bytes aleatórios em base64url. Só o hash vai para o banco; o token bruto vai só na mensagem ao candidato.
export const gerarTokenBruto = () => randomBytes(32).toString("base64url");

export function emitirLink({ admissao, links = [], agora, tokenBruto, finalidade = "PREENCHER_ADMISSAO" }: {
  admissao: Admissao; links?: Link[]; agora: string; tokenBruto: string; finalidade?: Finalidade;
}) {
  if (String(tokenBruto ?? "").length < 16) fail("token curto");
  if (finalidade === "PREENCHER_ADMISSAO" && admissao.status !== "PENDENTE") fail("link de preenchimento só para admissão pendente");
  if (finalidade === "PRIMEIRO_ACESSO" && admissao.status !== "CONCLUIDO") fail("primeiro acesso só depois de concluir");
  const t = Date.parse(agora); if (!Number.isFinite(t)) fail("data inválida");
  const validade = finalidade === "PRIMEIRO_ACESSO" ? VALIDADE_PRIMEIRO_ACESSO_HORAS * HORA : VALIDADE_LINK_DIAS * DIA;
  const anteriores = links.map(l =>
    l.admissaoId === admissao.id && l.finalidade === finalidade && !l.revogadoEm && !l.usadoEm ? { ...l, revogadoEm: agora } : l);
  const tokenHash = hashToken(tokenBruto);
  const link: Link = {
    id: "lnk-" + tokenHash.slice(0, 8), admissaoId: admissao.id, finalidade, tokenHash, criadoEm: agora,
    expiraEm: new Date(t + validade).toISOString(), usadoEm: null, revogadoEm: null,
  };
  return { link, links: [...anteriores, link] };
}

export type ResultadoToken =
  | { ok: true; admissaoId: string }
  | { ok: false; motivo: string; mensagem: string };

// Toda leitura e escrita pública passa por aqui. O motivo real vai só para o log; a pessoa vê sempre a mesma frase.
export function validarToken(link: LinkComAdmissao | null | undefined, agora: string, finalidade: Finalidade = "PREENCHER_ADMISSAO"): ResultadoToken {
  const recusa = (motivo: string) => ({ ok: false as const, motivo, mensagem: MENSAGEM_LINK_RECUSADO });
  const a = link?.admissao;
  if (!link || !a || link.admissaoId !== a.id) return recusa("NAO_ENCONTRADO");
  if (link.finalidade !== finalidade) return recusa("FINALIDADE_ERRADA");
  if (a.status === "CANCELADO") return recusa("CANCELADA");
  if (finalidade === "PREENCHER_ADMISSAO" && (a.status !== "PENDENTE" || a.preenchidoEm)) return recusa("JA_ENVIADO");
  if (finalidade === "PRIMEIRO_ACESSO" && a.status !== "CONCLUIDO") return recusa("NAO_CONCLUIDA");
  if (link.revogadoEm) return recusa("REVOGADO");
  if (link.usadoEm) return recusa("JA_USADO");
  const t = Date.parse(agora);
  if (!Number.isFinite(t) || t >= Date.parse(link.expiraEm)) return recusa("VENCIDO");
  return { ok: true, admissaoId: a.id };
}

// ---------- Escrita pública ----------

export function gravarRascunhoPublico(link: LinkComAdmissao, agora: string, campos: Record<string, unknown> | null | undefined) {
  const v = validarToken(link, agora); if (!v.ok) return v;
  const aceitos: Record<string, unknown> = {}, ignorados: string[] = [];
  for (const [k, val] of Object.entries(campos ?? {})) {
    if (!(CAMPOS_DO_CANDIDATO as readonly string[]).includes(k)) { ignorados.push(k); continue; }
    aceitos[k] = k === "dependentes" ? (Array.isArray(val) ? val.slice(0, 20).map(cortar) : []) : cortar(val);
  }
  return { ok: true as const, admissao: { ...link.admissao, ...aceitos } as Admissao, ignorados };
}

// Confere o tipo declarado. A rota confere também os bytes do arquivo (assinaturaDoArquivo).
export function anexarDocumentoPublico(link: LinkComAdmissao, agora: string, tipo: string, arquivo: { id: string; mime: string; tamanho: number }) {
  const v = validarToken(link, agora); if (!v.ok) return v;
  if (!(TIPOS_DOC as string[]).includes(tipo)) return { ok: false as const, motivo: "TIPO_INVALIDO" };
  const pdf = arquivo?.mime === "application/pdf";
  if (!pdf && !MIME_IMAGEM.includes(arquivo?.mime)) return { ok: false as const, motivo: "FORMATO_RECUSADO" };
  if (!(arquivo.tamanho > 0) || arquivo.tamanho > (pdf ? 5 : 15) * MB) return { ok: false as const, motivo: "TAMANHO_RECUSADO" };
  const docs = link.admissao.documentos ?? {};
  const t = tipo as TipoDoc;
  return { ok: true as const, admissao: { ...link.admissao, documentos: { ...docs, [t]: [...(docs[t] ?? []), arquivo.id] } } };
}

// Formato real pelos primeiros bytes. SVG, HTML e qualquer outra coisa voltam null.
export function assinaturaDoArquivo(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

// ---------- Documentos e envio ----------

function pendenciasDeDocumentos(a: Admissao, politica: Politica = POLITICA_PADRAO): Pendencia[] {
  const p: Pendencia[] = [], d = a.documentos ?? {}, id = (a.identidade ?? {}) as Record<string, unknown>, t = (a.tituloEleitor ?? {}) as Record<string, unknown>;
  if (!texto(t.numero) || !texto(t.zona) || !texto(t.secao) || !temArquivo(d.tituloEleitor)) p.push({ chave: "titulo", texto: "Título de eleitor com número, zona, seção e foto" });
  const tipo = a.tipoIdentidade ?? "RG_ANTIGO";
  if (tipo === "CNH") {
    if (!temArquivo(d.cnh) || !texto(id.numero) || !texto(id.categoria)) p.push({ chave: "identidade", texto: "CNH com foto, número e categoria" });
  } else if (tipo === "RG_NOVO_CIN" || tipo === "RG_ANTIGO") {
    if (!temArquivo(d.rg) || !texto(id.numero) || !texto(id.emissao) || !texto(id.orgao)) p.push({ chave: "identidade", texto: (tipo === "RG_NOVO_CIN" ? "RG novo (CIN)" : "RG") + " com foto, número, emissão e órgão" });
    if (tipo === "RG_ANTIGO" && !temArquivo(d.cpf)) p.push({ chave: "fotoCpf", texto: "Foto do CPF (quem usa RG antigo)" });
  } else fail("tipo de identidade inválido");
  if (!temArquivo(d.ctps)) p.push({ chave: "ctps", texto: "CTPS (foto ou print da carteira digital)" });
  if (!temArquivo(d.comprovante)) p.push({ chave: "comprovante", texto: "Comprovante de residência" });
  // Lista extra do contador para este tipo de contrato.
  const jaCobertos = new Set(["tituloEleitor", "cnh", "rg", "cpf", "ctps", "comprovante"]);
  for (const extra of politica.documentosPorContrato[a.tipoContrato] ?? []) {
    if (!jaCobertos.has(extra) && !temArquivo(d[extra])) p.push({ chave: "doc:" + extra, texto: NOME_DOC[extra] });
  }
  return p;
}

export function registrarEnvio(link: LinkComAdmissao, agora: string, politica: Politica = POLITICA_PADRAO) {
  const v = validarToken(link, agora); if (!v.ok) return v;
  const a = link.admissao as Admissao & Record<string, any>, f: string[] = [], b = a.banco ?? {};
  if (digitos(a.cpf).length !== 11) f.push("cpf");
  if (!texto(a.dataNascimento)) f.push("dataNascimento");
  if (!texto(a.pis) && a.primeiroEmprego !== true) f.push("pis");
  if (!texto(a.endereco?.cep) || !texto(a.endereco?.rua) || !texto(a.endereco?.numero)) f.push("endereco");
  if (!(texto(b.pixTipo) && texto(b.pixChave)) && !(texto(b.banco) && texto(b.agencia) && texto(b.conta))) f.push("banco");
  if (!texto(a.emergencia?.nome) || !texto(a.emergencia?.telefone)) f.push("emergencia");
  f.push(...pendenciasDeDocumentos(a, politica).map(p => p.chave));
  if (f.length) return { ok: false as const, camposFaltantes: f };
  return {
    ok: true as const,
    admissao: { ...a, status: "DOCS_RECEBIDOS" as Status, preenchidoEm: agora, versao: a.versao + 1 },
    link: { ...link, usadoEm: agora },
  };
}

// ---------- CPF ----------

export function cpfValido(cpf: unknown) {
  const d = digitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +d[9] && dv(10) === +d[10];
}
// Desligado com o mesmo CPF é recontratação e passa.
export const cpfDuplicado = (cpf: unknown, funcionarios: { cpf: string; status: string }[] = []) =>
  funcionarios.some(f => f.status === "ATIVO" && digitos(f.cpf) === digitos(cpf));
// Sem parâmetros de propósito: a resposta pública não tem como citar nome, loja ou cargo de outra pessoa.
export const erroCpfDuplicado = () => ({ codigo: "CPF_INDISPONIVEL", mensagem: MENSAGEM_CPF_INDISPONIVEL });

// O que a rota pública usa: CPF inválido ou de funcionário ativo recebem a MESMA resposta genérica.
export function conferirCpfDoCandidato(cpf: unknown, funcionariosAtivosComMesmoCpf: { cpf: string; status: string }[]) {
  if (!cpfValido(cpf) || cpfDuplicado(cpf, funcionariosAtivosComMesmoCpf)) return { ok: false as const, ...erroCpfDuplicado() };
  return { ok: true as const };
}

// ---------- Jornada e abertura ----------

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (h: string) => +h.slice(0, 2) * 60 + +h.slice(3);

export function pendenciasDaJornada(j: Jornada | null | undefined): string[] {
  if (!j) return ["jornada não informada"];
  const p: string[] = [];
  if (!["6X1", "5X2", "12X36"].includes(j.tipoEscala ?? "")) p.push("escala");
  if (!HHMM.test(j.entrada ?? "") || !HHMM.test(j.saida ?? "")) p.push("horários");
  else {
    let turno = minutos(j.saida!) - minutos(j.entrada!); if (turno <= 0) turno += 1440;
    if (!Number.isInteger(j.intervaloMin) || j.intervaloMin! < 0 || j.intervaloMin! > 240 || j.intervaloMin! >= turno) p.push("intervalo");
    if (j.tipoEscala === "12X36" && turno !== 720) p.push("plantão de 12 horas");
  }
  if (!(typeof j.cargaSemanal === "number" && j.cargaSemanal > 0 && j.cargaSemanal <= 60)) p.push("carga semanal");
  const hm = /^(\d{1,3}):([0-5]\d)$/.exec(j.horasMensais ?? "");
  if (!hm || +hm[1] < 1 || +hm[1] > 744) p.push("horas mensais");
  if (j.tipoEscala === "5X2" && !(Array.isArray(j.folgas) && j.folgas.length === 2 && j.folgas[0] !== j.folgas[1])) p.push("duas folgas fixas");
  if (String(j.fonteConfirmacao ?? "").trim().length < 5 || !j.confirmadaEm) p.push("confirmação do RH");
  return p;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIPOS_CONTRATO = ["EXPERIENCIA_30_60", "EXPERIENCIA_45_45", "INDETERMINADO", "APRENDIZ"];

export interface DadosAbertura {
  nome: string; telefone: string; email?: string | null; cpf?: string | null;
  cargo: string; funcao: string; setor: string; salarioCentavos: number; tipoContrato: string;
  dataAdmissao: string; jornada: Jornada; enviarLink: boolean; pisoCentavos?: number | null;
}

// Abrir a admissão: devolve erros (bloqueiam) e avisos (não bloqueiam). hoje é AAAA-MM-DD no fuso da loja.
export function validarAbertura(d: DadosAbertura, ator: Ator, hoje: string, politica: Politica = POLITICA_PADRAO) {
  const erros: string[] = [], avisos: string[] = [];
  if (!texto(d.nome) || d.nome.trim().split(/\s+/).length < 2) erros.push("Nome completo (duas palavras ou mais)");
  if (![10, 11].includes(digitos(d.telefone).length)) erros.push("Celular com DDD (10 ou 11 dígitos)");
  if (d.enviarLink && !(texto(d.email) && EMAIL.test(d.email.trim()))) erros.push("E-mail válido para mandar o link");
  if (texto(d.email) && !EMAIL.test(d.email.trim())) erros.push("E-mail inválido");
  if (texto(d.cpf) && !cpfValido(d.cpf)) erros.push("CPF inválido");
  if (!texto(d.cargo) || !texto(d.funcao) || !texto(d.setor)) erros.push("Cargo, função e setor");
  if (!Number.isInteger(d.salarioCentavos) || d.salarioCentavos <= 0) erros.push("Salário");
  if (!TIPOS_CONTRATO.includes(d.tipoContrato)) erros.push("Tipo de contrato");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dataAdmissao ?? "")) erros.push("Data de admissão");
  else {
    const diff = (Date.parse(d.dataAdmissao) - Date.parse(hoje)) / DIA;
    if (diff > politica.diasFuturosPermitidos) erros.push(`Data de admissão até ${politica.diasFuturosPermitidos} dias no futuro`);
    if (diff < 0) {
      if (!["OWNER", "ADMIN"].includes(ator.papel)) erros.push("Data retroativa só pelo dono ou admin");
      else if (-diff > politica.diasRetroativosPermitidos) erros.push(`Data retroativa só até ${politica.diasRetroativosPermitidos} dias`);
    }
  }
  const j = pendenciasDaJornada(d.jornada);
  if (j.length) erros.push("Jornada: " + j.join(", "));
  else if (d.jornada.confirmadaParaData !== d.dataAdmissao) erros.push("Jornada confirmada para outra data: confirme de novo");
  if (d.pisoCentavos && d.salarioCentavos < d.pisoCentavos) avisos.push("Salário abaixo do piso do cargo");
  return { ok: erros.length === 0, erros, avisos };
}

// ---------- ASO, assinaturas e pendências ----------

const dispensaValida = (d: DispensaAso | null | undefined) =>
  !!d && d.papel === "OWNER" && String(d.motivo ?? "").trim().length >= 10 && !d.revogadaEm;

function pendenciasDoAso(a: Admissao, hoje: string, armazenamento: Armazenamento): Pendencia[] {
  const aso = a.aso, p = (t: string) => [{ chave: "aso", texto: t }];
  if (!aso) return dispensaValida(a.asoDispensa) ? [] : p("ASO admissional enviado e conferido");
  const arq = armazenamento[aso.arquivoId];
  if (!arq || arq.sha256 !== aso.sha256) return p("Arquivo do ASO sumiu ou não confere com o original");
  if (aso.apto !== true) return p("ASO inapto: não existe dispensa para isso");
  if (!texto(aso.dataExame) || aso.dataExame > hoje || aso.dataExame > a.dataAdmissao) return p("Data do exame no futuro ou depois da admissão");
  if (aso.dataValidade && aso.dataValidade < a.dataAdmissao) return p("Validade do ASO termina antes da admissão");
  return [];
}

const assinado = (s: AssinaturaDoc | undefined) =>
  !!s && texto(s.assinadoEm) && texto(s.hashAssinatura) && s.envelopeStatus === "CONCLUIDO" && s.revisaoAssinada === s.revisaoAtual;

// Lista do que trava "Concluir admissão". A tela mostra exatamente esta lista. agora vem no fuso da loja (com offset).
export function pendenciasParaConcluir(a: Admissao, { agora, armazenamento = {}, politica = POLITICA_PADRAO }: {
  agora: string; armazenamento?: Armazenamento; politica?: Politica;
}): Pendencia[] {
  const hoje = String(agora ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje)) fail("informe agora no fuso da loja");
  if (a.status === "CANCELADO") return [{ chave: "status", texto: "Admissão cancelada" }];
  if (a.status === "CONCLUIDO") return [{ chave: "status", texto: "Admissão já concluída" }];
  const p: Pendencia[] = [];
  if (!["DOCS_RECEBIDOS", "ESOCIAL"].includes(a.status) || !a.preenchidoEm) p.push({ chave: "envio", texto: "Cadastro ainda não enviado" });
  const j = pendenciasDaJornada(a.jornada);
  if (j.length || a.jornada?.confirmadaParaData !== a.dataAdmissao) p.push({ chave: "escala", texto: "Escala e jornada confirmadas para esta data: " + (j.join(", ") || "a data de admissão mudou") });
  if (digitos(a.cpf).length !== 11) p.push({ chave: "cpf", texto: "CPF" });
  if (!texto(a.nome) || a.nome.trim().split(/\s+/).length < 2) p.push({ chave: "nome", texto: "Nome completo" });
  if (!texto(a.storeId)) p.push({ chave: "loja", texto: "Loja" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dataAdmissao ?? "")) p.push({ chave: "data", texto: "Data de admissão" });
  if (!texto(a.funcao) || !texto(a.cargo)) p.push({ chave: "funcao", texto: "Função e cargo" });
  p.push(...pendenciasDeDocumentos(a, politica), ...pendenciasDoAso(a, hoje, armazenamento));
  if (!assinado(a.assinaturas?.contrato)) p.push({ chave: "contrato", texto: "Contrato assinado na revisão atual" });
  if (politica.setoresComRegulamento.includes(a.setor) && !assinado(a.assinaturas?.regulamento))
    p.push({ chave: "regulamento", texto: `Regulamento do setor (${politica.nomesSetor[a.setor] ?? a.setor}) assinado` });
  return p;
}

export function dispensarAso(a: Admissao, ator: Ator, motivo: string, agora: string): Admissao {
  exigirEscopo(ator, a, ["OWNER"]);
  if (a.aso) fail("a dispensa só cobre a falta do ASO");
  if (String(motivo ?? "").trim().length < 10) fail("motivo com pelo menos 10 caracteres");
  return { ...a, asoDispensa: { autorizadoPor: ator.id, papel: ator.papel, motivo: motivo.trim(), em: agora, revogadaEm: null }, versao: a.versao + 1 };
}

// ---------- Transições, cancelamento, download, conclusão ----------

export function mudarStatus(a: Admissao, novo: Status, ator: Ator, politica: Politica = POLITICA_PADRAO): Admissao {
  exigirEscopo(ator, a);
  if (!podeIr(a.status, novo)) fail("transição inválida");
  if (novo === "CONCLUIDO") fail("use concluirAdmissao");
  if (novo === "CANCELADO") fail("use cancelarAdmissao");
  if (novo === "DOCS_RECEBIDOS" && !a.preenchidoEm) fail("cadastro ainda não enviado");
  if (novo === "ESOCIAL" && (digitos(a.cpf).length !== 11 || pendenciasDeDocumentos(a, politica).length)) fail("documentos incompletos para o eSocial");
  return { ...a, status: novo, versao: a.versao + 1 };
}

export function arquivosDaAdmissao(a: Admissao): string[] {
  const ids = [
    ...Object.values(a.documentos ?? {}).flat(),
    a.aso?.arquivoId, a.assinaturas?.contrato?.arquivoId, a.assinaturas?.regulamento?.arquivoId,
  ];
  return [...new Set(ids.filter((x): x is string => !!x))];
}

export function cancelarAdmissao({ admissao: a, links = [], ator, motivo, agora, politica = POLITICA_PADRAO }: {
  admissao: Admissao; links?: Link[]; ator: Ator; motivo: string; agora: string; politica?: Politica;
}) {
  exigirEscopo(ator, a);
  if (!podeIr(a.status, "CANCELADO")) fail("transição inválida");
  if (String(motivo ?? "").trim().length < 10) fail("motivo com pelo menos 10 caracteres");
  return {
    admissao: { ...a, status: "CANCELADO" as Status, canceladoEm: agora, canceladoPor: ator.id, motivoCancelamento: motivo.trim(), versao: a.versao + 1 },
    links: links.map(l => l.admissaoId === a.id && !l.revogadoEm ? { ...l, revogadoEm: agora } : l),
    excluirArquivos: arquivosDaAdmissao(a),
    anonimizarEm: new Date(Date.parse(agora) + politica.prazoAnonimizarDias * DIA).toISOString(),
  };
}

export function autorizarDownload({ ator, admissao: a, arquivoId, agora, armazenamento = {} }: {
  ator: Ator; admissao: Admissao; arquivoId: string; agora: string; armazenamento?: Armazenamento;
}) {
  exigirEscopo(ator, a);
  if (a.status === "CANCELADO" || !arquivosDaAdmissao(a).includes(arquivoId) || !armazenamento[arquivoId]) fail("arquivo não encontrado");
  if (arquivoId === a.aso?.arquivoId && !ator.permissoes?.includes("SAUDE_OCUPACIONAL")) fail("sem permissão");
  return { arquivoId, expiraEm: new Date(Date.parse(agora) + 5 * 60_000).toISOString() };
}

export function concluirAdmissao({ admissao: a, ator, agora, armazenamento = {}, tokenPrimeiroAcesso, versaoConferida, politica = POLITICA_PADRAO }: {
  admissao: Admissao; ator: Ator; agora: string; armazenamento?: Armazenamento; tokenPrimeiroAcesso: string; versaoConferida: number; politica?: Politica;
}) {
  exigirEscopo(ator, a);
  if (versaoConferida !== a.versao) fail("versão desatualizada: recarregue a admissão");
  const pendencias = pendenciasParaConcluir(a, { agora, armazenamento, politica });
  if (pendencias.length) return { ok: false as const, pendencias };
  if (!podeIr(a.status, "CONCLUIDO")) fail("transição inválida");
  // 1. Pacote da contabilidade. Se faltar um original, para aqui e nada é criado.
  const arquivos = arquivosDaAdmissao(a).map(id =>
    armazenamento[id] ? { arquivoId: id, tipo: armazenamento[id].tipo, sha256: armazenamento[id].sha256 } : fail(`pacote incompleto: falta o original ${id}`));
  const pacote = {
    nome: `admissao-${a.id}.zip`,
    resumo: { nome: a.nome, cpf: a.cpf, cargo: a.cargo, dataAdmissao: a.dataAdmissao, salarioCentavos: a.salarioCentavos, tipoContrato: a.tipoContrato, jornada: a.jornada },
    arquivos,
  };
  // 2. Funcionário. No banco: uma transação com lock por admissão e versão conferida.
  const funcionario = { id: "fun-" + a.id, tenantId: a.tenantId, storeId: a.storeId, nome: a.nome, cargo: a.cargo, funcao: a.funcao, dataAdmissao: a.dataAdmissao, status: "ATIVO" as const };
  const concluida: Admissao = { ...a, status: "CONCLUIDO", concluidoEm: agora, funcionarioId: funcionario.id, versao: a.versao + 1 };
  // 3. Integrações na fila, fora da transação. Falha numa delas não desfaz a admissão.
  const integracoes = INTEGRACOES.map(tipo => ({ tipo, status: "PENDENTE" as const, tentativas: 0 }));
  // 4. Primeiro acesso por link de uso único. Nunca senha derivada do CPF, nunca senha por e-mail.
  const { link: primeiroAcesso } = emitirLink({ admissao: concluida, agora, tokenBruto: tokenPrimeiroAcesso, finalidade: "PRIMEIRO_ACESSO" });
  return { ok: true as const, admissao: concluida, pacote, funcionario, integracoes, primeiroAcesso };
}

// Para logs: troca qualquer link de admissão por um marcador.
export const mascararLinks = (s: string) => s.replace(/\/admissao\/[A-Za-z0-9_-]+/g, "/admissao/[link da admissão]");
