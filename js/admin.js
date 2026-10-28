// Funções exclusivas do painel administrativo.
async function initAdmin() {
  const view = document.querySelector("#adminView");
  if (!view) return;
  const status = document.querySelector("#adminStatus");
  const editor = document.querySelector("#adminEditor"),
    editorForm = document.querySelector("#productEditor");
  const confirmBox = document.querySelector("#confirmDialog");
  let section = "resumo",
    data = [];
  try {
    const profile = user;
    if (!profile.logado || !profile.admin)
      throw new Error("Área restrita. Entre com uma conta de administrador.");
  } catch (e) {
    view.innerHTML = `<div class="surface"><h2>Acesso restrito</h2><p>${esc(e.message)}</p><a class="btn primary" href="login.html">Fazer login</a></div>`;
    return;
  }
  const titles = {
    resumo: "Visão geral",
    produtos: "Gerenciar produtos",
    usuarios: "Usuários cadastrados",
    contatos: "Mensagens recebidas",
    pedidos: "Pedidos registrados",
  };
  const th = (headers) =>
    `<thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead>`;
  const table = (headers, rows) =>
    `<div class="admin-table-wrap"><table class="admin-table">${th(headers)}<tbody>${rows || `<tr><td colspan="${headers.length}">Nenhum registro encontrado.</td></tr>`}</tbody></table></div>`;
  const toolbar = (name, extra = "") =>
    `<div class="admin-toolbar"><div><h2>${name}</h2><p>Informações diretamente do banco de dados.</p></div>${extra}</div>`;
  const search = () =>
    '<input class="admin-search" type="search" id="adminSearch" placeholder="Pesquisar nesta tabela..." aria-label="Pesquisar registros">';
  let requestVersion = 0;
  async function load(next = section) {
    const version = ++requestVersion;
    section = next;
    document
      .querySelectorAll(".admin-tab")
      .forEach((b) =>
        b.classList.toggle("selected", b.dataset.section === section),
      );
    view.innerHTML = '<div class="loading-card">Carregando dados...</div>';
    try {
      const response = await request(API(`admin.php?acao=${section}`));
      if (version !== requestVersion) return;
      data = response.itens || [];
      if (section === "resumo") {
        const stats = [
          ["produtos", "Produtos ativos"],
          ["usuarios", "Usuários"],
          ["mensagens", "Mensagens"],
          ["pedidos", "Pedidos"],
        ];
        const cards = stats
          .map(
            ([key, label]) =>
              `<div class="stat-card"><span>${label}</span><strong>${Number(response[key] || 0)}</strong></div>`,
          )
          .join("");
        const ps = (response.produtos_recentes || [])
          .map(
            (p) =>
              `<tr><td>#${Number(p.id)}</td><td>${esc(p.nome)}</td><td>${brl(p.preco)}</td><td>${Number(p.estoque)}</td></tr>`,
          )
          .join("");
        const os = (response.pedidos_recentes || [])
          .map(
            (p) =>
              `<tr><td>#${Number(p.id)}</td><td>${esc(p.nome)}</td><td>${brl(p.total)}</td><td>${esc(p.status)}</td></tr>`,
          )
          .join("");
        view.innerHTML = `${toolbar("Visão geral da loja")}<div class="stat-grid">${cards}</div><h3>Últimos produtos</h3>${table(["ID", "Produto", "Preço", "Estoque"], ps)}<h3 style="margin-top:32px">Últimos pedidos</h3>${table(["ID", "Cliente", "Total", "Status"], os)}`;
      } else if (section === "produtos") {
        view.innerHTML =
          toolbar(
            titles[section],
            `${search()}<button type="button" class="btn primary" data-new>+ Novo produto</button>`,
          ) +
          table(
            [
              "ID",
              "Produto",
              "Categoria",
              "Preço",
              "Estoque",
              "Situação",
              "Ações",
            ],
            data
              .map(
                (p) =>
                  `<tr><td>#${Number(p.id)}</td><td>${esc(p.nome)}</td><td>${esc(p.categoria)}</td><td>${brl(p.preco)}</td><td>${Number(p.estoque)}</td><td><span class="status-pill">${Number(p.ativo) ? "Ativo" : "Arquivado"}</span></td><td><div class="table-actions"><button class="table-button" data-edit="${Number(p.id)}">Editar</button><button class="table-button ${Number(p.ativo) ? "danger" : ""}" data-toggle="${Number(p.id)}" data-active="${Number(p.ativo) ? "0" : "1"}">${Number(p.ativo) ? "Arquivar" : "Reativar"}</button></div></td></tr>`,
              )
              .join(""),
          );
      } else if (section === "usuarios") {
        view.innerHTML =
          toolbar(titles[section], search()) +
          table(
            ["ID", "Nome", "E-mail", "Perfil", "Cadastro", "Ação"],
            data
              .map(
                (p) =>
                  `<tr><td>#${Number(p.id)}</td><td>${esc(p.nome)}</td><td>${esc(p.email)}</td><td>${esc(p.perfil)}</td><td>${esc(p.criado_em)}</td><td>${p.perfil === "admin" ? '<span class="muted">Protegido</span>' : `<button class="table-button danger" data-delete-user="${Number(p.id)}">Excluir</button>`}</td></tr>`,
              )
              .join(""),
          );
      } else if (section === "contatos") {
        view.innerHTML =
          toolbar(titles[section], search()) +
          table(
            ["ID", "Nome", "E-mail", "Assunto", "Mensagem", "Ação"],
            data
              .map(
                (p) =>
                  `<tr><td>#${Number(p.id)}</td><td>${esc(p.nome)}</td><td>${esc(p.email)}</td><td>${esc(p.assunto)}</td><td class="long-cell">${esc(p.mensagem)}</td><td><button class="table-button danger" data-delete-contact="${Number(p.id)}">Excluir</button></td></tr>`,
              )
              .join(""),
          );
      } else if (section === "pedidos") {
        view.innerHTML =
          toolbar(titles[section], search()) +
          table(
            ["ID", "Cliente", "Detalhes", "Total", "Data", "Status"],
            data
              .map(
                (p) =>
                  `<tr><td>#${Number(p.id)}</td><td>${esc(p.nome)}<br><small>${esc(p.email)}</small></td><td class="long-cell">${p.itens.map((i) => `${Number(i.quantidade)} × ${esc(i.nome)} (${brl(i.preco_unitario)})`).join("<br>")}</td><td>${brl(p.total)}</td><td>${esc(p.criado_em)}</td><td><select class="table-select" aria-label="Status do pedido ${Number(p.id)}" data-order="${Number(p.id)}">${["recebido", "preparando", "concluido", "cancelado"].map((x) => `<option value="${x}" ${x === p.status ? "selected" : ""}>${x}</option>`).join("")}</select></td></tr>`,
              )
              .join(""),
          );
      }
      const searchField = view.querySelector("#adminSearch");
      searchField?.addEventListener("input", () => {
        const term = searchField.value.toLocaleLowerCase("pt-BR");
        view
          .querySelectorAll("tbody tr")
          .forEach(
            (tr) =>
              (tr.hidden = !tr.textContent
                .toLocaleLowerCase("pt-BR")
                .includes(term)),
          );
      });
    } catch (err) {
      if (version !== requestVersion) return;
      view.innerHTML = `<div class="surface"><h2>Não foi possível carregar</h2><p>${esc(err.message)}</p></div>`;
      feedback(status, err.message, true);
    }
  }
  async function action(name, values, message) {
    try {
      await postForm(
        API(`admin.php?acao=${name}`),
        new URLSearchParams(values),
      );
      feedback(status, message);
      await load();
    } catch (e) {
      feedback(status, e.message, true);
    }
  }
  function confirmAction(message, callback) {
    document.querySelector("#confirmText").textContent = message;
    const yes = document.querySelector("#confirmYes");
    yes.onclick = () => {
      confirmBox.close();
      callback();
    };
    confirmBox.showModal();
  }
  document
    .querySelector("#confirmNo")
    .addEventListener("click", () => confirmBox.close());
  document
    .querySelector("#closeEditor")
    .addEventListener("click", () => editor.close());
  document
    .querySelectorAll(".admin-tab")
    .forEach((button) =>
      button.addEventListener("click", () => load(button.dataset.section)),
    );
  view.addEventListener("click", (e) => {
    const target = e.target.closest("button");
    if (!target) return;
    if (target.hasAttribute("data-new")) {
      editorForm.reset();
      editorForm.elements.namedItem("id").value = "0";
      document.querySelector("#editorTitle").textContent = "Cadastrar produto";
      editor.showModal();
    }
    if (target.hasAttribute("data-edit")) {
      const item = data.find(
        (x) => Number(x.id) === Number(target.dataset.edit),
      );
      if (!item) return;
      editorForm.reset();
      for (const field of [
        "id",
        "nome",
        "categoria",
        "descricao",
        "preco",
        "estoque",
        "imagem",
      ])
        editorForm.elements.namedItem(field).value =
          field === "imagem"
            ? String(item[field] || "")
                .split("/")
                .pop()
            : (item[field] ?? "");
      const img = editorForm.elements.namedItem("imagem");
      if (!Array.from(img.options).some((opt) => opt.value === img.value))
        img.value = "cachorro.jpg";
      document.querySelector("#editorTitle").textContent =
        `Editar produto #${item.id}`;
      editor.showModal();
    }
    if (target.hasAttribute("data-toggle")) {
      const active = target.dataset.active,
        id = Number(target.dataset.toggle);
      confirmAction(
        `Deseja ${active === "0" ? "arquivar" : "reativar"} o produto #${id}? Produtos arquivados saem do catálogo, mas permanecem no histórico dos pedidos.`,
        () =>
          action(
            "alterar_produto",
            { id: String(id), ativo: active },
            "Situação do produto atualizada.",
          ),
      );
    }
    if (target.hasAttribute("data-delete-user")) {
      const id = Number(target.dataset.deleteUser);
      confirmAction(
        `Excluir o usuário #${id}? A exclusão é bloqueada caso existam pedidos associados.`,
        () =>
          action("excluir_usuario", { id: String(id) }, "Usuário excluído."),
      );
    }
    if (target.hasAttribute("data-delete-contact")) {
      const id = Number(target.dataset.deleteContact);
      confirmAction(`Excluir a mensagem #${id} permanentemente?`, () =>
        action("excluir_contato", { id: String(id) }, "Mensagem excluída."),
      );
    }
  });
  view.addEventListener("change", (e) => {
    if (!e.target.matches("[data-order]")) return;
    const id = Number(e.target.dataset.order),
      statusValue = e.target.value;
    action(
      "status_pedido",
      { id: String(id), status: statusValue },
      "Status do pedido atualizado.",
    );
  });
  editorForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editorForm.reportValidity()) return;
    const button = editorForm.querySelector("[type=submit]");
    button.disabled = true;
    try {
      const data = await postForm(
        API("admin.php?acao=salvar_produto"),
        new FormData(editorForm),
      );
      editor.close();
      feedback(status, data.mensagem);
      await load("produtos");
    } catch (e) {
      toast(e.message, true);
    } finally {
      button.disabled = false;
    }
  });
  load();
}
