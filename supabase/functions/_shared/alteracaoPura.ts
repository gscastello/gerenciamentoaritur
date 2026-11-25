// Alteração completa de uma reserva pelo atendente de IA (issue #538) — parte pura.
//
// Junta o que a reserva É com o que o cliente pediu para mudar e devolve a reserva como ela vai FICAR, para as mesmas
// conferências de uma reserva nova (vaga, sentido, cidade, valor). O endereço antigo nunca sobra num lugar novo: trocar o
// sentido, a cidade da Volta ou sair da busca em casa apaga o embarque de antes e pede o novo quando ele é essencial.

import { MAX_PASSAGENS_POR_PEDIDO } from "./agentePuro.ts";

export type ReservaAtual = {
  data: string;
  direcao: "ida" | "volta";
  ponto: string;
  bairro: string | null;
  endereco: string | null;
  desembarque: string | null;
  quantidade: number;
  pagamento: string | null;
};

export type PedidoDeAlteracao = Record<string, unknown>;

export type Alteracao = ReservaAtual & {
  /** campos que mudam de verdade */
  mudou: {
    viagem: boolean;
    ponto: boolean;
    embarque: boolean;
    desembarque: boolean;
    quantidade: boolean;
    pagamento: boolean;
    nome: boolean;
  };
  nome: string | null;
};

const texto = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const CIDADES = new Set(["pirapemas", "cantanhede"]);

/**
 * `codigoDoPonto` traduz o que o modelo escreveu (nome ou código) para o código do ponto NO SENTIDO final; devolve null
 * quando não existe.
 */
export function montarAlteracao(
  atual: ReservaAtual,
  p: PedidoDeAlteracao,
  hoje: string,
  codigoDoPonto: (nome: string, direcao: "ida" | "volta") => string | null,
): { ok: true; alteracao: Alteracao } | { ok: false; codigo: string; erro: string } {
  const erro = (codigo: string, e: string) => ({ ok: false as const, codigo, erro: e });

  const novaData = texto(p.nova_data);
  if (novaData && !/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return erro("DATA_INVALIDA", "nova_data inválida (use AAAA-MM-DD).");
  if (novaData && novaData < hoje) return erro("DATA_INVALIDA", "nova_data já passou.");
  const dir = texto(p.nova_direcao).toLowerCase();
  if (dir && dir !== "ida" && dir !== "volta") return erro("SENTIDO_INVALIDO", "nova_direcao deve ser ida ou volta.");

  const temQtd = texto(p.nova_quantidade) !== "";
  const qtd = temQtd ? Number(p.nova_quantidade) : atual.quantidade;
  if (!Number.isInteger(qtd) || qtd < 1) {
    return erro("QUANTIDADE_INVALIDA", "nova_quantidade deve ser um inteiro de 1 em diante; para zerar, use cancelar_reserva.");
  }
  if (temQtd && qtd > MAX_PASSAGENS_POR_PEDIDO) {
    return erro("QUANTIDADE_INVALIDA", `mais de ${MAX_PASSAGENS_POR_PEDIDO} passagens só a equipe resolve (chame o atendente).`);
  }
  const pag = texto(p.nova_forma_pagamento).toLowerCase();
  if (pag && !["dinheiro", "pix", "cartao"].includes(pag)) {
    return erro("PAGAMENTO_INVALIDO", "nova_forma_pagamento deve ser dinheiro, pix ou cartao.");
  }
  const nome = texto(p.novo_nome);
  if (nome && nome.length < 3) return erro("NOME_INVALIDO", "novo_nome curto demais.");

  const direcao = (dir || atual.direcao) as "ida" | "volta";
  const trocouSentido = direcao !== atual.direcao;
  const pontoPedido = texto(p.novo_ponto);
  if (trocouSentido && !pontoPedido) {
    return erro("FALTA_EMBARQUE", "Mudou o sentido: diga em novo_ponto onde ele embarca agora (pergunte ao cliente).");
  }
  const ponto = pontoPedido ? codigoDoPonto(pontoPedido, direcao) : atual.ponto;
  if (!ponto) return erro("PONTO_NAO_EXISTE", "Ponto de embarque desconhecido nesse sentido.");

  const novoBairro = texto(p.novo_bairro);
  const novoEndereco = texto(p.novo_endereco);
  const trocouPonto = trocouSentido || ponto !== atual.ponto;
  // lugar novo não herda o endereço antigo
  let bairro = trocouPonto ? null : atual.bairro;
  let endereco = trocouPonto ? null : atual.endereco;
  if (novoBairro) {
    // bairro novo na mesma busca em casa: a rua de antes era do outro bairro
    if (!trocouPonto && novoBairro.toLowerCase() !== (atual.bairro ?? "").toLowerCase()) endereco = null;
    bairro = novoBairro;
  }
  if (novoEndereco) endereco = novoEndereco;
  if (trocouPonto) {
    if (ponto === "busca" && !bairro && !endereco) {
      return erro("FALTA_EMBARQUE", "Busca em casa: falta o bairro ou o endereço (pergunte ao cliente).");
    }
    if (ponto === "outro" && !endereco) {
      return erro("FALTA_EMBARQUE", "Falta dizer em novo_endereco qual é o local de embarque (pergunte ao cliente).");
    }
    if (CIDADES.has(ponto) && !endereco) {
      return erro("FALTA_EMBARQUE", "Falta a rua ou referência onde buscar nessa cidade (pergunte ao cliente).");
    }
  }

  const novoDesembarque = texto(p.novo_desembarque);
  // trocou o sentido: o desembarque antigo é do outro lado da rota
  const desembarque = novoDesembarque || (trocouSentido ? null : atual.desembarque);

  const data = novaData || atual.data;
  const pagamento = pag || atual.pagamento;
  const igual = (a: string | null, b: string | null) => texto(a).toLowerCase() === texto(b).toLowerCase();
  const mudou = {
    viagem: data !== atual.data || trocouSentido,
    ponto: trocouPonto,
    embarque: !igual(bairro, atual.bairro) || !igual(endereco, atual.endereco),
    desembarque: !igual(desembarque, atual.desembarque),
    quantidade: qtd !== atual.quantidade,
    pagamento: pagamento !== atual.pagamento,
    nome: !!nome,
  };
  if (!Object.values(mudou).some(Boolean)) {
    return erro("NADA_MUDOU", "A reserva já está assim: nada a mudar. Conte ao cliente como ela está.");
  }
  return { ok: true, alteracao: { data, direcao, ponto, bairro, endereco, desembarque, quantidade: qtd, pagamento, nome: nome || null, mudou } };
}

/** Quantos lugares a mais a mudança pede na viagem final (0 = não precisa conferir vaga). */
export function lugaresAMais(atual: ReservaAtual, a: Alteracao): number {
  return a.mudou.viagem ? a.quantidade : Math.max(0, a.quantidade - atual.quantidade);
}

/** O valor depende de onde sobe, onde desce e do sentido; do dia e da quantidade, não. */
export function mudaOValor(a: Alteracao): boolean {
  return a.mudou.ponto || a.mudou.embarque || a.mudou.desembarque;
}

/** O que muda em `p_details` do rpc_edit_reservation (texto vazio limpa o campo). */
export function detalhesDaAlteracao(a: Alteracao, area: string | null): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  if (a.mudou.ponto || a.mudou.embarque) {
    d.pickup_neighborhood = a.bairro ?? "";
    d.pickup_detail = a.endereco ?? "";
    // rua e referência à parte são do endereço antigo
    d.street = "";
    d.reference_point = "";
  }
  if (a.mudou.desembarque) {
    d.dropoff_location = a.desembarque ?? "";
    d.dropoff_area = area ?? "";
    d.dropoff_detail = "";
  }
  if (a.mudou.pagamento && a.pagamento) d.payment_method = a.pagamento;
  return d;
}
