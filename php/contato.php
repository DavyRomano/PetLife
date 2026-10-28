<?php
declare(strict_types=1);
require_once __DIR__ . "/conexao.php";
metodo("POST");
verificar_csrf();
$nome = post_text("nome", 100);
$email = post_text("email", 150);
$assunto = post_text("assunto", 150);
$mensagem = post_text("mensagem", 2000);
if (
  text_len($nome) < 2 ||
  !filter_var($email, FILTER_VALIDATE_EMAIL) ||
  !$assunto ||
  text_len($mensagem) < 5
) {
  json_out(["erro" => "Preencha todos os campos corretamente."], 422);
}
try {
  $stmt = $conn->prepare(
    "INSERT INTO contatos(nome,email,assunto,mensagem) VALUES (?,?,?,?)",
  );
  $stmt->bind_param("ssss", $nome, $email, $assunto, $mensagem);
  $stmt->execute();
  json_out(
    ["sucesso" => true, "mensagem" => "Mensagem enviada com sucesso!"],
    201,
  );
} catch (Throwable $e) {
  erro_interno($e);
}
