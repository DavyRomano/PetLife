<?php
declare(strict_types=1);
require_once __DIR__ . "/conexao.php";
admin_obrigatorio();
$acao = (string) ($_GET["acao"] ?? "resumo");
if ($_SERVER["REQUEST_METHOD"] === "GET") {
  try {
    if ($acao === "resumo") {
      $resumo = [];
      foreach (
        [
          "produtos" => "SELECT COUNT(*) n FROM produtos WHERE ativo=1",
          "usuarios" => "SELECT COUNT(*) n FROM usuarios",
          "mensagens" => "SELECT COUNT(*) n FROM contatos",
          "pedidos" => "SELECT COUNT(*) n FROM pedidos",
        ]
        as $nome => $query
      ) {
        $resumo[$nome] = (int) $conn->query($query)->fetch_assoc()["n"];
      }
      $resumo["produtos_recentes"] = $conn
        ->query(
          "SELECT id,nome,preco,estoque FROM produtos ORDER BY id DESC LIMIT 5",
        )
        ->fetch_all(MYSQLI_ASSOC);
      $resumo["pedidos_recentes"] = $conn
        ->query(
          "SELECT p.id,p.total,p.status,p.criado_em,u.nome FROM pedidos p JOIN usuarios u ON p.usuario_id=u.id ORDER BY p.id DESC LIMIT 5",
        )
        ->fetch_all(MYSQLI_ASSOC);
      json_out($resumo);
    }
    if ($acao === "produtos") {
      json_out([
        "itens" => $conn
          ->query(
            "SELECT id,nome,categoria,descricao,preco,imagem,estoque,ativo FROM produtos ORDER BY id DESC LIMIT 500",
          )
          ->fetch_all(MYSQLI_ASSOC),
      ]);
    }
    if ($acao === "usuarios") {
      json_out([
        "itens" => $conn
          ->query(
            "SELECT id,nome,email,perfil,criado_em FROM usuarios ORDER BY id DESC LIMIT 500",
          )
          ->fetch_all(MYSQLI_ASSOC),
      ]);
    }
    if ($acao === "contatos") {
      json_out([
        "itens" => $conn
          ->query(
            "SELECT id,nome,email,assunto,mensagem,criado_em FROM contatos ORDER BY id DESC LIMIT 500",
          )
          ->fetch_all(MYSQLI_ASSOC),
      ]);
    }
    if ($acao === "pedidos") {
      $pedidos = $conn
        ->query(
          "SELECT p.id,p.total,p.status,p.criado_em,u.nome,u.email FROM pedidos p JOIN usuarios u ON u.id=p.usuario_id ORDER BY p.id DESC LIMIT 300",
        )
        ->fetch_all(MYSQLI_ASSOC);
      $detalhes = $conn
        ->query(
          "SELECT i.pedido_id,i.quantidade,i.preco_unitario,pr.nome FROM pedido_itens i JOIN produtos pr ON pr.id=i.produto_id ORDER BY i.pedido_id DESC",
        )
        ->fetch_all(MYSQLI_ASSOC);
      $grupos = [];
      foreach ($detalhes as $d) {
        $grupos[$d["pedido_id"]][] = $d;
      }
      foreach ($pedidos as &$p) {
        $p["itens"] = $grupos[$p["id"]] ?? [];
      }
      json_out(["itens" => $pedidos]);
    }
    json_out(["erro" => "Seção não encontrada."], 404);
  } catch (Throwable $e) {
    erro_interno($e);
  }
}
metodo("POST");
verificar_csrf();
try {
  if ($acao === "salvar_produto") {
    $id = filter_var($_POST["id"] ?? 0, FILTER_VALIDATE_INT);
    $id = $id === false ? 0 : $id;
    $nome = post_text("nome", 150);
    $categoria = post_text("categoria", 50);
    $descricao = post_text("descricao", 2000);
    $precoRaw = trim((string) ($_POST["preco"] ?? ""));
    $estoque = filter_var($_POST["estoque"] ?? null, FILTER_VALIDATE_INT);
    $imagem = post_text("imagem", 100);
    if (
      !$nome ||
      !$categoria ||
      !is_numeric($precoRaw) ||
      (float) $precoRaw < 0 ||
      (float) $precoRaw > 9999999 ||
      $estoque === false ||
      $estoque === null ||
      $estoque < 0 ||
      $estoque > 100000 ||
      !in_array(
        $imagem,
        [
          "raçao.jpg",
          "bola.jpg",
          "cama.jpg",
          "coleira.jpg",
          "cachorro.jpg",
          "hero.jpg",
        ],
        true,
      )
    ) {
      json_out(["erro" => "Confira os dados do produto."], 422);
    }
    $preco = round((float) $precoRaw, 2);
    if ($id > 0) {
      $stmt = $conn->prepare(
        "UPDATE produtos SET nome=?,categoria=?,descricao=?,preco=?,estoque=?,imagem=? WHERE id=?",
      );
      $stmt->bind_param(
        "sssdisi",
        $nome,
        $categoria,
        $descricao,
        $preco,
        $estoque,
        $imagem,
        $id,
      );
    } else {
      $stmt = $conn->prepare(
        "INSERT INTO produtos(nome,categoria,descricao,preco,estoque,imagem) VALUES (?,?,?,?,?,?)",
      );
      $stmt->bind_param(
        "sssdis",
        $nome,
        $categoria,
        $descricao,
        $preco,
        $estoque,
        $imagem,
      );
    }
    // Para produtos existentes, a atualização não altera o histórico dos pedidos.
    $stmt->execute();
    json_out(["sucesso" => true, "mensagem" => "Produto salvo com sucesso."]);
  }
  if ($acao === "alterar_produto") {
    $id = post_id();
    $ativo = ($_POST["ativo"] ?? "") === "1" ? 1 : 0;
    $stmt = $conn->prepare("UPDATE produtos SET ativo=? WHERE id=?");
    $stmt->bind_param("ii", $ativo, $id);
    $stmt->execute();
    json_out([
      "sucesso" => true,
      "mensagem" => $ativo
        ? "Produto reativado."
        : "Produto retirado do catálogo.",
    ]);
  }
  if ($acao === "excluir_usuario") {
    $id = post_id();
    if ($id === (int) $_SESSION["usuario_id"]) {
      json_out(
        ["erro" => "Você não pode excluir a própria conta administrativa."],
        422,
      );
    }
    $stmt = $conn->prepare("SELECT perfil FROM usuarios WHERE id=?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();
    if (!$u) {
      json_out(["erro" => "Usuário não encontrado."], 404);
    }
    if ($u["perfil"] === "admin") {
      json_out(
        [
          "erro" =>
            "Contas de administradores não podem ser excluídas por este painel.",
        ],
        403,
      );
    }
    $stmt = $conn->prepare(
      "DELETE FROM usuarios WHERE id=? AND perfil='cliente'",
    );
    $stmt->bind_param("i", $id);
    $stmt->execute();
    json_out(["sucesso" => true, "mensagem" => "Usuário excluído."]);
  }
  if ($acao === "excluir_contato") {
    $id = post_id();
    $stmt = $conn->prepare("DELETE FROM contatos WHERE id=?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    json_out(["sucesso" => true, "mensagem" => "Mensagem excluída."]);
  }
  if ($acao === "status_pedido") {
    $id = post_id();
    $status = post_text("status", 30);
    if (
      !in_array(
        $status,
        ["recebido", "preparando", "concluido", "cancelado"],
        true,
      )
    ) {
      json_out(["erro" => "Status não permitido."], 422);
    }
    $stmt = $conn->prepare("UPDATE pedidos SET status=? WHERE id=?");
    $stmt->bind_param("si", $status, $id);
    $stmt->execute();
    json_out(["sucesso" => true, "mensagem" => "Pedido atualizado."]);
  }
  json_out(["erro" => "Ação desconhecida."], 404);
} catch (mysqli_sql_exception $e) {
  if ($e->getCode() === 1451) {
    json_out(
      [
        "erro" =>
          "Este usuário possui pedidos registrados e não pode ser excluído.",
      ],
      409,
    );
  }
  erro_interno($e);
} catch (Throwable $e) {
  erro_interno($e);
}
