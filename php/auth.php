<?php
require_once __DIR__ . "/conexao.php";

$acao = $_GET["acao"] ?? "status";

if ($acao === "status") {
  metodo("GET");

  json_out([
    "logado" => isset($_SESSION["usuario_id"]),
    "nome" => $_SESSION["usuario_nome"] ?? null,
    "admin" => ($_SESSION["perfil"] ?? "") === "admin",
    "csrf" => token_csrf(),
  ]);
}

metodo("POST");
verificar_csrf();

if ($acao === "logout") {
  $_SESSION = [];
  session_regenerate_id(true);
  json_out(["sucesso" => true]);
}

if ($acao === "cadastro") {
  $nome = post_text("nome", 100);
  $email = strtolower(post_text("email", 150));
  $senha = (string) ($_POST["senha"] ?? "");
  $confirmacao = (string) ($_POST["confirmacao"] ?? "");

  if (
    text_len($nome) < 2 ||
    !filter_var($email, FILTER_VALIDATE_EMAIL) ||
    strlen($senha) < 8 ||
    strlen($senha) > 200 ||
    $senha !== $confirmacao
  ) {
    json_out(
      ["erro" => "Confira nome, e-mail e senha (mínimo de 8 caracteres)."],
      422,
    );
  }

  try {
    $hash = password_hash($senha, PASSWORD_DEFAULT);
    $sql = "INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("sss", $nome, $email, $hash);
    $stmt->execute();

    json_out(
      [
        "sucesso" => true,
        "mensagem" => "Cadastro realizado! Agora entre na sua conta.",
      ],
      201,
    );
  } catch (mysqli_sql_exception $erro) {
    if ($erro->getCode() === 1062) {
      json_out(["erro" => "Este e-mail já está cadastrado."], 409);
    }
    erro_interno($erro);
  }
}

if ($acao === "login") {
  $email = strtolower(post_text("email", 150));
  $senha = (string) ($_POST["senha"] ?? "");

  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_out(["erro" => "Informe um e-mail válido."], 422);
  }

  try {
    $sql =
      "SELECT id, nome, senha, perfil FROM usuarios WHERE email = ? LIMIT 1";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $usuario = $stmt->get_result()->fetch_assoc();

    if (!$usuario || !password_verify($senha, $usuario["senha"])) {
      json_out(["erro" => "E-mail ou senha incorretos."], 401);
    }

    session_regenerate_id(true);
    $_SESSION["usuario_id"] = (int) $usuario["id"];
    $_SESSION["usuario_nome"] = $usuario["nome"];
    $_SESSION["perfil"] = $usuario["perfil"];
    $_SESSION["csrf"] = bin2hex(random_bytes(32));

    json_out([
      "sucesso" => true,
      "csrf" => $_SESSION["csrf"],
      "admin" => $usuario["perfil"] === "admin",
    ]);
  } catch (Throwable $erro) {
    erro_interno($erro);
  }
}

json_out(["erro" => "Ação desconhecida."], 404);
