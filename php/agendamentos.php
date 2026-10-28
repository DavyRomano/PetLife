<?php
declare(strict_types=1);
require_once __DIR__ . "/conexao.php";
metodo("POST");
verificar_csrf();
$nome = post_text("nome", 100);
$email = strtolower(post_text("email", 150));
$servico = post_text("servico", 80);
$data = post_text("data_preferida", 10);
$observacoes = post_text("observacoes", 1000);
$servicos = [
  "Banho e tosa",
  "Orientação sobre bem-estar",
  "Outras informações",
];
$d = DateTimeImmutable::createFromFormat("!Y-m-d", $data);
if (
  text_len($nome) < 2 ||
  !filter_var($email, FILTER_VALIDATE_EMAIL) ||
  !in_array($servico, $servicos, true) ||
  !$d ||
  $d->format("Y-m-d") !== $data ||
  $data < date("Y-m-d")
) {
  json_out(["erro" => "Confira os dados e informe uma data válida."], 422);
}
try {
  $stmt = $conn->prepare(
    "INSERT INTO agendamentos (nome,email,servico,data_preferida,observacoes) VALUES (?,?,?,?,?)",
  );
  $stmt->bind_param("sssss", $nome, $email, $servico, $data, $observacoes);
  $stmt->execute();
  json_out(
    [
      "mensagem" =>
        "Solicitação recebida e registrada! A data ainda não está confirmada.",
    ],
    201,
  );
} catch (Throwable $e) {
  erro_interno($e);
}
