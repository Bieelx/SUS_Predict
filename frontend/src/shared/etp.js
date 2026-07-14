export const REFERENCIA_LEGAL = 'Lei 14.133/2021, art. 18 - Estudo Tecnico Preliminar';

export const DOCUMENTOS_INICIAIS = [
  { id: 'doc-1', nome: 'Dipirona 500mg', origem: 'Insumos', data: '07/07/2026', status: 'finalizado' },
  { id: 'doc-2', nome: 'Soro fisiológico 1L', origem: 'Insumos', data: '28/06/2026', status: 'rascunho' },
  { id: 'doc-3', nome: 'Insulina NPH', origem: 'Insumos', data: '30/06/2026', status: 'finalizado' },
  { id: 'doc-4', nome: 'Amoxicilina 500mg', origem: 'Insumos', data: '15/06/2026', status: 'finalizado' },
  { id: 'doc-5', nome: 'Paracetamol 750mg', origem: 'Alertas', data: '02/06/2026', status: 'finalizado' },
  { id: 'doc-6', nome: 'Ondansetrona 8mg', origem: 'Insumos', data: '20/05/2026', status: 'finalizado' },
];

function normalizarAscii(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '');
}

function escaparPdf(valor) {
  return normalizarAscii(valor).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function quebrarLinhas(texto, maxChars = 86) {
  const linhasOriginais = Array.isArray(texto) ? texto : String(texto || '').split('\n');
  const saida = [];

  linhasOriginais.forEach(linhaOriginal => {
    const linha = normalizarAscii(linhaOriginal).trimEnd();
    if (!linha) {
      saida.push('');
      return;
    }

    let atual = '';
    linha.split(/\s+/).forEach(palavra => {
      if (!atual) {
        atual = palavra;
        return;
      }

      if (`${atual} ${palavra}`.length <= maxChars) {
        atual += ` ${palavra}`;
        return;
      }

      saida.push(atual);
      atual = palavra;
    });

    if (atual) saida.push(atual);
  });

  return saida;
}

function paginarLinhas(linhas, linhasPorPagina = 44) {
  const paginas = [];
  for (let i = 0; i < linhas.length; i += linhasPorPagina) {
    paginas.push(linhas.slice(i, i + linhasPorPagina));
  }
  return paginas.length ? paginas : [['']];
}

function blobPdfSimples(linhas) {
  const linhasFormatadas = quebrarLinhas(linhas);
  const paginas = paginarLinhas(linhasFormatadas);
  const objetos = [];

  objetos.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  const pageObjectIds = paginas.map((_, index) => 3 + index * 2);
  const contentObjectIds = paginas.map((_, index) => 4 + index * 2);

  objetos.push(`2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${paginas.length} >>\nendobj`);

  paginas.forEach((pagina, index) => {
    const pageId = pageObjectIds[index];
    const contentId = contentObjectIds[index];
    const conteudoLinhas = [
      'BT',
      '/F1 12 Tf',
      '50 790 Td',
      ...pagina.flatMap((linha, i) => (i === 0 ? [`(${escaparPdf(linha)}) Tj`] : ['0 -16 Td', `(${escaparPdf(linha)}) Tj`])),
      'ET',
    ];
    const stream = `${conteudoLinhas.join('\n')}\n`;

    objetos.push(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${3 + paginas.length * 2} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj`);
    objetos.push(`${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj`);
  });

  const fontObjectId = 3 + paginas.length * 2;
  objetos.push(`${fontObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objetos.forEach(obj => {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  });

  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export function dataHojeBr() {
  return new Date().toLocaleDateString('pt-BR');
}

export function baixarEtpPdf({ nome, origem, data, texto }) {
  const blob = blobPdfSimples([
    'ESTUDO TECNICO PRELIMINAR',
    `Item: ${nome}`,
    `Origem: ${origem || 'Sistema'}`,
    `Gerado em: ${data || dataHojeBr()}`,
    `Base legal: ${REFERENCIA_LEGAL}`,
    '',
    ...(texto ? String(texto).split('\n') : ['Documento gerado no historico do SusPredict.']),
  ]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ETP-${normalizarAscii(nome).replace(/\s+/g, '-')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
