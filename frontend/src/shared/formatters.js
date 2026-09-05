// Missing observations must never become measured zeroes.
export function numero(valor) {
  if (valor == null || typeof valor === 'boolean' || String(valor).trim() === '') return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function formatar(valor, opcoes) {
  const valido = numero(valor);
  return valido == null ? 'Não informado' : valido.toLocaleString('pt-BR', opcoes);
}
export const inteiro = valor => formatar(valor, { maximumFractionDigits: 0 });
export const decimal = valor => formatar(valor, { maximumFractionDigits: 2 });
export const moeda = valor => formatar(valor, { style: 'currency', currency: 'BRL' });
export const percentual = valor => numero(valor) == null ? 'Não informado' : `${decimal(valor)}%`;
export const dias = valor => numero(valor) == null ? 'Não informado' : `${decimal(valor)} dias`;
export function dataBr(valor) {
  if (!valor || Number.isNaN(new Date(valor).getTime())) return 'Não informada';
  return new Date(valor).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
export function janelaDados(linha) {
  if (!linha?.periodo_inicio || !linha?.periodo_fim) return 'Janela temporal não informada pela fonte';
  return `Período dos dados: ${dataBr(linha.periodo_inicio)} a ${dataBr(linha.periodo_fim)}`;
}
const ROTULOS = {
  ANALGESICO_ANTITERMICO: 'Analgésicos e antitérmicos',
  HIDRATACAO_PARENTERAL: 'Hidratação parenteral', HIDRATACAO_ORAL: 'Hidratação oral',
  SEM_ALERTA: 'Sem alerta', ALTO: 'Alto', MODERADO: 'Moderado', BAIXO: 'Baixo',
};
export const rotuloDado = valor => ROTULOS[valor] || valor || 'Não informado';
