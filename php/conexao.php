<?php
declare(strict_types=1);
date_default_timezone_set("America/Sao_Paulo");
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
if (session_status() !== PHP_SESSION_ACTIVE) {
  session_set_cookie_params([
    "lifetime" => 0,
    "path" => "/",
    "httponly" => true,
    "samesite" => "Lax",
    "secure" => !empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off",
  ]);
  session_start();
}
header("Cache-Control: no-store");
header("X-Content-Type-Options: nosniff");
try {
  $dbHost = getenv("PETLIFE_DB_HOST") ?: "localhost";
  $dbUser = getenv("PETLIFE_DB_USER") ?: "root";
  $dbPass = getenv("PETLIFE_DB_PASS") ?: "";
  $dbName = getenv("PETLIFE_DB_NAME") ?: "petlife";
  $conn = new mysqli($dbHost, $dbUser, $dbPass, $dbName);
  $conn->set_charset("utf8mb4");
} catch (mysqli_sql_exception $e) {
  error_log("PetLife - MySQL: " . $e->getMessage());
  header("Content-Type: application/json; charset=utf-8");
  http_response_code(503);
  exit(
    json_encode(
      [
        "erro" =>
          "Banco de dados indisponível. Confira o XAMPP e importe sql/petlife.sql.",
      ],
      JSON_UNESCAPED_UNICODE,
    )
  );
}
function json_out(array $dados, int $codigo = 200): never
{
  http_response_code($codigo);
  header("Content-Type: application/json; charset=utf-8");
  echo json_encode(
    $dados,
    JSON_UNESCAPED_UNICODE |
      JSON_UNESCAPED_SLASHES |
      JSON_INVALID_UTF8_SUBSTITUTE,
  );
  exit();
}
function metodo(string $nome): void
{
  if ($_SERVER["REQUEST_METHOD"] !== $nome) {
    json_out(["erro" => "Método não permitido."], 405);
  }
}
function token_csrf(): string
{
  if (!isset($_SESSION["csrf"])) {
    $_SESSION["csrf"] = bin2hex(random_bytes(32));
  }
  return $_SESSION["csrf"];
}
function verificar_csrf(): void
{
  $token = $_SERVER["HTTP_X_CSRF_TOKEN"] ?? ($_POST["csrf"] ?? "");
  if (!is_string($token) || !hash_equals(token_csrf(), $token)) {
    json_out(
      ["erro" => "Sessão expirada ou inválida. Atualize a página."],
      403,
    );
  }
}
function usuario_obrigatorio(): int
{
  if (empty($_SESSION["usuario_id"])) {
    json_out(["erro" => "Faça login para continuar.", "login" => true], 401);
  }
  return (int) $_SESSION["usuario_id"];
}
function admin_obrigatorio(): int
{
  global $conn;
  $id = usuario_obrigatorio();
  if (($_SESSION["perfil"] ?? "") !== "admin") {
    json_out(["erro" => "Acesso restrito aos administradores."], 403);
  }
  $stmt = $conn->prepare("SELECT perfil FROM usuarios WHERE id=? LIMIT 1");
  $stmt->bind_param("i", $id);
  $stmt->execute();
  $u = $stmt->get_result()->fetch_assoc();
  if (!$u || $u["perfil"] !== "admin") {
    json_out(["erro" => "Permissão administrativa não está mais ativa."], 403);
  }
  return $id;
}
function text_len(string $valor): int
{
  return function_exists("mb_strlen") ? mb_strlen($valor) : strlen($valor);
}
function post_text(string $chave, int $limite = 255): string
{
  $valor = trim((string) ($_POST[$chave] ?? ""));
  if (text_len($valor) > $limite) {
    json_out(
      ["erro" => "Campo " . $chave . " excede o tamanho permitido."],
      422,
    );
  }
  return $valor;
}
function post_id(string $chave = "id"): int
{
  $id = filter_var($_POST[$chave] ?? null, FILTER_VALIDATE_INT);
  if ($id === false || $id === null || $id < 1) {
    json_out(["erro" => "Identificador inválido."], 422);
  }
  return $id;
}
function erro_interno(
  Throwable $e,
  string $mensagem = "Não foi possível concluir a operação.",
): never {
  error_log("PetLife: " . $e->getMessage());
  json_out(["erro" => $mensagem], 500);
}
