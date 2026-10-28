<?php
declare(strict_types=1);
require_once __DIR__ . "/conexao.php";
metodo("GET");
$busca = trim((string) ($_GET["busca"] ?? ""));
$categoria = trim((string) ($_GET["categoria"] ?? ""));
$ordem = (string) ($_GET["ordem"] ?? "recentes");
$ordens = [
  "recentes" => "id DESC",
  "menor" => "preco ASC",
  "maior" => "preco DESC",
  "az" => "nome ASC",
];
if (
  !isset($ordens[$ordem]) ||
  text_len($busca) > 100 ||
  text_len($categoria) > 50
) {
  json_out(["erro" => "Filtro inválido."], 422);
}
$min = (string) ($_GET["min"] ?? "");
$max = (string) ($_GET["max"] ?? "");
if (
  ($min !== "" && (!is_numeric($min) || (float) $min < 0)) ||
  ($max !== "" && (!is_numeric($max) || (float) $max < 0))
) {
  json_out(["erro" => "Faixa de preço inválida."], 422);
}
if ($min !== "" && $max !== "" && (float) $min > (float) $max) {
  json_out(
    ["erro" => "O preço mínimo deve ser menor ou igual ao máximo."],
    422,
  );
}
$sql =
  "SELECT id,nome,categoria,descricao,preco,imagem,estoque FROM produtos WHERE ativo=1";
$tipos = "";
$args = [];
if (isset($_GET["ids"]) && $_GET["ids"] !== "") {
  $ids = explode(",", (string) $_GET["ids"]);
  if (count($ids) > 50) {
    json_out(["erro" => "Produtos demais."], 422);
  }
  foreach ($ids as $rawId) {
    if (!ctype_digit($rawId) || (int) $rawId < 1) {
      json_out(["erro" => "Identificadores inválidos."], 422);
    }
  }
  $ids = array_values(array_unique(array_map("intval", $ids)));
  if (!$ids || min($ids) < 1) {
    json_out(["erro" => "Identificadores inválidos."], 422);
  }
  $sql .= " AND id IN (" . implode(",", array_fill(0, count($ids), "?")) . ")";
  $tipos .= str_repeat("i", count($ids));
  $args = array_merge($args, $ids);
}

if ($busca !== "") {
  $sql .= " AND nome LIKE ?";
  $tipos .= "s";
  $args[] = "%" . $busca . "%";
}
if ($categoria !== "") {
  $sql .= " AND categoria=?";
  $tipos .= "s";
  $args[] = $categoria;
}
if ($min !== "") {
  $sql .= " AND preco>=?";
  $tipos .= "d";
  $args[] = (float) $min;
}
if ($max !== "") {
  $sql .= " AND preco<=?";
  $tipos .= "d";
  $args[] = (float) $max;
}
$sql .= " ORDER BY " . $ordens[$ordem] . " LIMIT 120";
try {
  $stmt = $conn->prepare($sql);
  if ($args) {
    $stmt->bind_param($tipos, ...$args);
  }
  $stmt->execute();
  $lista = [];
  foreach ($stmt->get_result() as $p) {
    $p["id"] = (int) $p["id"];
    $p["preco"] = (float) $p["preco"];
    $p["estoque"] = (int) $p["estoque"];
    $p["imagem"] = basename(
      str_replace("\\", "/", (string) ($p["imagem"] ?? "")),
    );
    if ($p["imagem"] === "ração.jpg") {
      $p["imagem"] = "raçao.jpg";
    }
    if (
      !in_array(
        $p["imagem"],
        [
          "hero.jpg",
          "cachorro.jpg",
          "bola.jpg",
          "cama.jpg",
          "coleira.jpg",
          "ração.jpg",
          "raçao.jpg",
        ],
        true,
      )
    ) {
      $p["imagem"] = "cachorro.jpg";
    }
    $lista[] = $p;
  }
  json_out(["produtos" => $lista]);
} catch (Throwable $e) {
  erro_interno($e, "Não foi possível carregar o catálogo.");
}
