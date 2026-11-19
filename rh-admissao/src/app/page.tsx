import { POLITICA_PADRAO, VALIDADE_LINK_DIAS } from "@/lib/admissao/nucleo";

// Página provisória. As telas (abrir admissão, formulário do candidato, painel do RH) entram nas etapas 3 a 5.
export default function Inicio() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 28 }}>Admissões</h1>
      <p>Base pronta: banco de dados e regras da admissão por link. As telas vêm nas próximas etapas.</p>
      <ul>
        <li>Link do candidato vale {VALIDADE_LINK_DIAS} dias.</li>
        <li>Setores com regulamento: {POLITICA_PADRAO.setoresComRegulamento.join(", ")} (ajustável por loja).</li>
      </ul>
    </main>
  );
}
