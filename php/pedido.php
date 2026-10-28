<?php
declare(strict_types=1);
require_once __DIR__ . "/conexao.php";
$uid = usuario_obrigatorio();
if ($_SERVER["REQUEST_METHOD"] === "GET") {
  try {
    $stmt = $conn->prepare(
      "SELECT id,total,status,criado_em FROM pedidos WHERE usuario_id=? ORDER BY id DESC LIMIT 30",
    );
    $stmt->bind_param("i", $uid);
    $stmt->execute();
    json_out(["pedidos" => $stmt->get_result()->fetch_all(MYSQLI_ASSOC)]);
  } catch (Throwable $e) {
    erro_interno($e);
  }
}
metodo("POST");
verificar_csrf();
$body = json_decode(file_get_contents("php://input"), true);
if (
  !is_array($body) ||
  !isset($body["itens"]) ||
  !is_array($body["itens"]) ||
  count($body["itens"]) < 1 ||
  count($body["itens"]) > 50
) {
  json_out(["erro" => "Carrinho inválido."], 422);
}
$itens = [];
foreach ($body["itens"] as $item) {
  if (!is_array($item)) {
    json_out(["erro" => "Produto inválido."], 422);
  }
  $id = filter_var($item["id"] ?? null, FILTER_VALIDATE_INT);
  $qtd = filter_var($item["quantidade"] ?? null, FILTER_VALIDATE_INT);
  if (
    $id === false ||
    $id === null ||
    $id < 1 ||
    $qtd === false ||
    $qtd === null ||
    $qtd < 1 ||
    $qtd > 50
  ) {
    json_out(["erro" => "Quantidade inválida."], 422);
  }
  $itens[$id] = ($itens[$id] ?? 0) + $qtd;
  if ($itens[$id] > 50) {
    json_out(["erro" => "Limite de 50 unidades por produto."], 422);
  }
}
try {
  $conn->begin_transaction();
  $linhas = [];
  $total = 0;
  ksort($itens); // ordem consistente dos bloqueios, reduz chance de deadlock
  $stmt = $conn->prepare(
    "SELECT id,nome,preco,estoque FROM produtos WHERE id=? AND ativo=1 FOR UPDATE",
  );
  foreach ($itens as $id => $qtd) {
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $p = $stmt->get_result()->fetch_assoc();
    if (!$p) {
      throw new DomainException("Um produto não está mais disponível.");
    }
    if ((int) $p["estoque"] < $qtd) {
      throw new DomainException(
        "Estoque insuficiente para " . $p["nome"] . ".",
      );
    }
    $preco = (float) $p["preco"];
    $total += round($preco * $qtd, 2);
    $linhas[] = [$id, $qtd, $preco];
  }
  $ins = $conn->prepare(
    "INSERT INTO pedidos(usuario_id,total,status) VALUES (?,?,'recebido')",
  );
  $ins->bind_param("id", $uid, $total);
  $ins->execute();
  $pedidoId = $conn->insert_id;
  $linhaStmt = $conn->prepare(
    "INSERT INTO pedido_itens(pedido_id,produto_id,quantidade,preco_unitario) VALUES (?,?,?,?)",
  );
  $estoqueStmt = $conn->prepare(
    "UPDATE produtos SET estoque=estoque-? WHERE id=? AND estoque>=?",
  );
  foreach ($linhas as [$id, $qtd, $preco]) {
    $linhaStmt->bind_param("iiid", $pedidoId, $id, $qtd, $preco);
    $linhaStmt->execute();
    $estoqueStmt->bind_param("iii", $qtd, $id, $qtd);
    $estoqueStmt->execute();
    if ($estoqueStmt->affected_rows !== 1) {
      throw new DomainException("O estoque mudou. Atualize o carrinho.");
    }
  }
  $conn->commit();
  json_out(["sucesso" => true, "pedido" => $pedidoId, "total" => $total], 201);
} catch (DomainException $e) {
  $conn->rollback();
  json_out(["erro" => $e->getMessage()], 409);
} catch (Throwable $e) {
  $conn->rollback();
  erro_interno($e);
}
