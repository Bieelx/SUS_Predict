"""PDF do rascunho de ETP (Lei 14.133/2021, art. 18, §1º).

Um único gerador para web, Telegram e WhatsApp. Números vêm só do registro
salvo por `gerar_etp`; o que o sistema não sabe fica explícito "a preencher".
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from fpdf import FPDF

from api.core import db
from api.core.permissoes import Acesso, require_acesso, verificar_municipio

router = APIRouter(prefix="/api/etp", tags=["etp"])

A_PREENCHER = "[A preencher pela secretaria]"

# (inciso, título, obrigatório pelo §2º)
ELEMENTOS = [
    ("I", "Descrição da necessidade da contratação", True),
    ("II", "Previsão no plano de contratações anual", False),
    ("III", "Requisitos da contratação", False),
    ("IV", "Estimativa das quantidades e memória de cálculo", True),
    ("V", "Levantamento de mercado", False),
    ("VI", "Estimativa do valor da contratação", True),
    ("VII", "Descrição da solução como um todo", False),
    ("VIII", "Justificativa para o parcelamento ou não da contratação", True),
    ("IX", "Resultados pretendidos", False),
    ("X", "Providências a serem adotadas previamente à celebração do contrato", False),
    ("XI", "Contratações correlatas e/ou interdependentes", False),
    ("XII", "Possíveis impactos ambientais e medidas mitigadoras", False),
    ("XIII", "Posicionamento conclusivo sobre a adequação da contratação", True),
]


def _latin1(texto: str) -> str:
    """Fontes core do PDF são latin-1: acentos do PT-BR cabem, travessões e aspas curvas não."""
    trocas = {"—": "-", "–": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...", "•": "-"}
    for de, para in trocas.items():
        texto = texto.replace(de, para)
    return texto.encode("latin-1", "replace").decode("latin-1")


def _conteudo(etp: dict) -> dict[str, str]:
    item = etp["item"]
    return {
        "I": etp["justificativa"],
        "III": (
            f"Aquisição de {item} com registro válido na Anvisa, código CATMAT, prazo de validade "
            f"mínimo na entrega e condições de armazenamento conforme o fabricante. {A_PREENCHER}"
        ),
        "IV": (
            "Memória de cálculo parcial gerada pelo SusPredict a partir da cobertura informada acima "
            "(estoque atual / consumo médio diário). Quantidade final = consumo médio diário x período "
            f"de cobertura desejado + margem de segurança - estoque e pedidos em trânsito. {A_PREENCHER}"
        ),
        "V": f"Verificar atas de registro de preços vigentes, consórcios intermunicipais e pregão. {A_PREENCHER}",
        "VI": (
            "Consultar o Banco de Preços em Saúde (BPS) e o preço máximo de venda ao governo (PMVG/CMED). "
            f"O SusPredict não estima valores. {A_PREENCHER}"
        ),
        "IX": f"Manter a cobertura de {item} e evitar ruptura no atendimento.",
        "XII": "Descarte de embalagens e medicamentos vencidos conforme a RDC Anvisa 222/2018.",
        "XIII": (
            "Rascunho de apoio à decisão. A adequação da contratação depende de revisão técnica e "
            f"jurídica da secretaria. {A_PREENCHER}"
        ),
    }


class _PdfEtp(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 44)
        self.set_text_color(235, 235, 235)
        with self.rotation(35, self.w / 2, self.h / 2):
            self.text(self.w / 2 - 75, self.h / 2, "RASCUNHO")
        self.set_text_color(0, 0, 0)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.cell(0, 5, _latin1(f"Rascunho gerado pelo SusPredict - sem validade jurídica - página {self.page_no()}"),
                  align="C")


def gerar_pdf_etp(etp: dict) -> bytes:
    """Monta o PDF com os 13 elementos do art. 18, §1º. Retorna os bytes."""
    pdf = _PdfEtp(format="A4")
    pdf.set_margins(18, 18, 18)
    pdf.set_auto_page_break(True, margin=18)
    pdf.add_page()

    criado = etp.get("criado_em") or ""
    try:
        criado = datetime.fromisoformat(criado).strftime("%d/%m/%Y")
    except ValueError:
        pass

    pdf.set_font("Helvetica", "B", 15)
    pdf.multi_cell(0, 8, _latin1("Estudo Técnico Preliminar (ETP) - Rascunho"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5, _latin1(
        f"Objeto: aquisição de {etp['item']}\n"
        f"Município (IBGE): {etp['ibge6']}   Data: {criado}   Identificador: {etp['id']}\n"
        "Unidade requisitante: [A preencher]   Responsável: [A preencher]   Dotação: [A preencher]\n"
        "Referência: Lei 14.133/2021, art. 18, §1º. (*) elemento obrigatório pelo §2º."
    ), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    conteudo = _conteudo(etp)
    for inciso, titulo, obrigatorio in ELEMENTOS:
        pdf.set_font("Helvetica", "B", 11)
        pdf.multi_cell(0, 6, _latin1(f"{inciso} - {titulo}{' (*)' if obrigatorio else ''}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, _latin1(conteudo.get(inciso, A_PREENCHER)), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    return bytes(pdf.output())


def nome_arquivo_etp(etp: dict) -> str:
    return f"ETP-rascunho-{etp['id'][:8]}.pdf"


@router.get("/{etp_id}/pdf")
def baixar_pdf_etp(etp_id: str, acesso: Acesso = Depends(require_acesso("gerar_etp"))):
    etp = db.get_etp(etp_id)
    if not etp:
        raise HTTPException(404, "ETP não encontrado")
    verificar_municipio(acesso, etp["ibge6"])
    return Response(
        gerar_pdf_etp(etp),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo_etp(etp)}"'},
    )
