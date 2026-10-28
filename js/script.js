"use strict";
const ROOT = new URL("../", document.currentScript.src);
const API = (file) => new URL(`php/${file}`, ROOT);
const IMAGE = (file) =>
  new URL(`img/${encodeURIComponent(file || "cachorro.jpg")}`, ROOT).href;
const brl = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value) || 0,
  );
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const page = document.body.dataset.page;
let csrfToken = "";
let user = { logado: false, admin: false };
let toastTimer;
function toast(message, error = false) {
  const box = document.querySelector("#toast");
  if (!box) return;
  box.textContent = message;
  box.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), 3800);
}
function feedback(node, message, error = false) {
  if (!node) {
    toast(message, error);
    return;
  }
  node.textContent = message;
  node.className = `form-feedback show${error ? " error" : ""}`;
}
async function request(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.method && options.method.toUpperCase() !== "GET")
    headers.set("X-CSRF-Token", csrfToken);
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Não foi possível acessar o servidor. Abra o site pelo localhost com o Apache ligado.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("Resposta inválida do servidor. Confira PHP e MySQL no XAMPP.");
  }
  if (!response.ok) {
    const e = new Error(data.erro || "Não foi possível concluir a operação.");
    e.status = response.status;
    e.login = data.login;
    throw e;
  }
  return data;
}
async function postForm(url, formData) {
  return request(url, { method: "POST", body: formData });
}
function getCart() {
  try {
    const saved = JSON.parse(localStorage.getItem("petlifeCarrinho") || "[]");
    if (!Array.isArray(saved)) return [];
    const merged = new Map();
    for (const item of saved) {
      const id = Number(item.id),
        quantidade = Number(item.quantidade);
      if (
        Number.isSafeInteger(id) &&
        id > 0 &&
        Number.isInteger(quantidade) &&
        quantidade > 0
      )
        merged.set(id, Math.min(50, (merged.get(id) || 0) + quantidade));
    }
    return Array.from(merged, ([id, quantidade]) => ({ id, quantidade })).slice(
      0,
      50,
    );
  } catch {
    return [];
  }
}
function saveCart(items) {
  try {
    localStorage.setItem("petlifeCarrinho", JSON.stringify(items));
    updateCount();
  } catch {
    toast("Não foi possível salvar o carrinho neste navegador.", true);
  }
}
function updateCount() {
  const count = getCart().reduce((sum, item) => sum + item.quantidade, 0);
  document
    .querySelectorAll("#cartCount")
    .forEach((x) => (x.textContent = count));
}
function addCart(product) {
  if (Number(product.estoque) < 1) {
    toast("Produto esgotado.", true);
    return;
  }
  const items = getCart(),
    item = items.find((i) => i.id === Number(product.id));
  if (item) {
    if (item.quantidade >= Math.min(50, Number(product.estoque))) {
      toast("Limite de unidades atingido.", true);
      return;
    }
    item.quantidade++;
  } else if (items.length < 50)
    items.push({ id: Number(product.id), quantidade: 1 });
  else {
    toast("Limite de itens diferentes atingido.", true);
    return;
  }
  saveCart(items);
  toast("Adicionado ao carrinho!");
}
async function catalog(params = new URLSearchParams()) {
  const url = API("api_produtos.php");
  url.search = params.toString();
  return (await request(url)).produtos;
}
function cardHTML(p) {
  return `<article class="product-card"><div class="product-photo"><img loading="lazy" alt="${esc(p.nome)}" src="${IMAGE(p.imagem)}"><span class="product-chip">${esc(p.categoria)}</span></div><div class="product-content"><h3>${esc(p.nome)}</h3><p>${esc(p.descricao || "Um cuidado especial para seu pet.")}</p><div class="product-bottom"><strong>${brl(p.preco)}</strong><button type="button" class="add-cart" data-add="${Number(p.id)}" ${Number(p.estoque) < 1 ? "disabled" : ""}>${Number(p.estoque) < 1 ? "Esgotado" : "+ Adicionar"}</button></div><div class="stock-info">${Number(p.estoque) > 0 ? `${Number(p.estoque)} disponível(is)` : "Sem estoque"}</div></div></article>`;
}
function drawProducts(container, items) {
  container.innerHTML = items.length
    ? items.map(cardHTML).join("")
    : '<div class="loading-card">Nenhum produto encontrado. Tente outros filtros.</div>';
  container.querySelectorAll("[data-add]").forEach((button) =>
    button.addEventListener("click", () => {
      const found = items.find(
        (x) => Number(x.id) === Number(button.dataset.add),
      );
      if (found) addCart(found);
    }),
  );
}
function initTheme() {
  let selected = "light";
  try {
    selected = localStorage.getItem("petlifeTema") || "light";
  } catch {}
  document
    .querySelector("#themeToggle")
    ?.setAttribute("aria-pressed", String(selected === "dark"));
  if (selected === "dark") document.documentElement.dataset.theme = "dark";
  document.querySelector("#themeToggle")?.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document
      .querySelector("#themeToggle")
      .setAttribute("aria-pressed", String(dark));
    try {
      localStorage.setItem("petlifeTema", dark ? "dark" : "light");
    } catch {}
  });
}
function initNav() {
  const button = document.querySelector(".menu-btn"),
    nav = document.querySelector("#mainNav");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav?.classList.contains("open")) {
      nav.classList.remove("open");
      button?.setAttribute("aria-expanded", "false");
      button?.focus();
    }
  });
  button?.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
  });
  nav?.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      nav.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    }),
  );
}
async function initUser() {
  try {
    user = await request(API("auth.php?acao=status"));
    csrfToken = user.csrf;
    const link = document.querySelector("[data-account-link]");
    if (link && user.logado) {
      link.textContent = `Olá, ${user.nome.split(" ")[0]}`;
      link.href = new URL("pages/pedidos.html", ROOT).href;
      const logout = document.createElement("button");
      logout.type = "button";
      logout.className = "text-button";
      logout.textContent = "Sair";
      logout.addEventListener("click", async () => {
        try {
          await request(API("auth.php?acao=logout"), { method: "POST" });
          window.location.href = ROOT.href;
        } catch (e) {
          toast(e.message, true);
        }
      });
      link.after(logout);
    }
    document
      .querySelectorAll("[data-admin-link]")
      .forEach((a) => (a.hidden = !user.admin));
  } catch (e) {
    if (
      ["login", "cadastro", "contato", "carrinho", "admin", "pedidos"].includes(
        page,
      )
    )
      toast(e.message, true);
  }
}
function initForms() {
  const bind = (id, endpoint, statusId, success) => {
    const form = document.querySelector(`#${id}`);
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const submit = form.querySelector("[type=submit]"),
        before = submit.textContent;
      submit.disabled = true;
      submit.textContent = "Enviando...";
      try {
        const data = await postForm(API(endpoint), new FormData(form));
        feedback(
          document.querySelector(`#${statusId}`),
          data.mensagem || "Pronto!",
        );
        success?.(data, form);
      } catch (err) {
        feedback(document.querySelector(`#${statusId}`), err.message, true);
      } finally {
        submit.disabled = false;
        submit.textContent = before;
      }
    });
  };
  bind("loginForm", "auth.php?acao=login", "loginMessage", () => {
    window.location.href = ROOT.href;
  });
  bind(
    "registerForm",
    "auth.php?acao=cadastro",
    "registerMessage",
    (_data, form) => {
      form.reset();
      const a = document.createElement("a");
      a.href = new URL("pages/login.html", ROOT);
      a.textContent = " Acessar login";
      document.querySelector("#registerMessage")?.append(a);
    },
  );
  bind("contactForm", "contato.php", "contactMessage", (_data, form) =>
    form.reset(),
  );
}
async function initProducts() {
  const list = document.querySelector("#productsList"),
    featured = document.querySelector("#featuredProducts");
  if (featured) {
    try {
      drawProducts(featured, (await catalog()).slice(0, 3));
    } catch (e) {
      featured.innerHTML = `<div class="loading-card">${esc(e.message)}</div>`;
    }
  }
  if (!list) return;
  const form = document.querySelector("#productFilters");
  const qp = new URLSearchParams(location.search);
  for (const [key, id] of [
    ["categoria", "#productCategory"],
    ["busca", "#productSearch"],
  ])
    if (qp.has(key)) document.querySelector(id).value = qp.get(key);
  let latestSearch = 0;
  async function load() {
    const searchId = ++latestSearch;
    list.innerHTML = '<div class="loading-card">Buscando produtos...</div>';
    const params = new URLSearchParams();
    for (const [id, key] of [
      ["#productSearch", "busca"],
      ["#productCategory", "categoria"],
      ["#productMin", "min"],
      ["#productMax", "max"],
      ["#productSort", "ordem"],
    ]) {
      const value = document.querySelector(id)?.value?.trim();
      if (value) params.set(key, value);
    }
    try {
      const products = await catalog(params);
      if (searchId !== latestSearch) return;
      drawProducts(list, products);
      document.querySelector("#productCount").textContent =
        `${products.length} produto(s) encontrado(s)`;
    } catch (error) {
      if (searchId !== latestSearch) return;
      list.innerHTML = `<div class="loading-card">${esc(error.message)}</div>`;
      document.querySelector("#productCount").textContent =
        "Catálogo indisponível";
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    load();
  });
  let searchTimer;
  document.querySelector("#productSearch")?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 320);
  });
  document.querySelector("#productCategory")?.addEventListener("change", load);
  form.addEventListener("reset", () => {
    setTimeout(load, 0);
  });
  document.querySelector("#productSort").addEventListener("change", load);
  load();
}
async function initCart() {
  const rows = document.querySelector("#cartItems");
  if (!rows) return;
  const message = document.querySelector("#cartMessage");
  let latest = [];
  let cartVersion = 0;
  async function render() {
    const version = ++cartVersion;
    const cart = getCart();
    updateCount();
    if (!cart.length) {
      rows.innerHTML =
        '<div class="empty-state"><div class="empty-icon">♡</div><strong>Sua sacola está vazia</strong><p>Seu próximo favorito está esperando no catálogo.</p><a class="btn primary" href="produtos.html">Ver produtos ↗</a></div>';
      document.querySelector("#cartTotal").textContent = brl(0);
      document.querySelector("#cartSubtotal").textContent = brl(0);
      latest = [];
      return;
    }
    rows.innerHTML =
      '<div class="loading-card">Atualizando seu carrinho...</div>';
    try {
      const products = await catalog(
        new URLSearchParams({ ids: cart.map((i) => i.id).join(",") }),
      );
      if (version !== cartVersion) return;
      const map = new Map(products.map((p) => [Number(p.id), p]));
      latest = cart.map((item) => ({ ...item, product: map.get(item.id) }));
      rows.innerHTML = latest
        .map(({ id, quantidade, product }) =>
          product
            ? `<div class="cart-item"><img alt="${esc(product.nome)}" src="${IMAGE(product.imagem)}"><div><h3>${esc(product.nome)}</h3><p>${esc(product.categoria)} · ${brl(product.preco)} cada</p><strong>${brl(Number(product.preco) * quantidade)}</strong>${quantidade > Number(product.estoque) ? '<small class="muted">Estoque menor que a quantidade selecionada</small>' : ""}</div><div class="cart-controls"><button class="qty-button" type="button" data-cart="menos" data-id="${id}" aria-label="Diminuir quantidade">−</button><b>${quantidade}</b><button class="qty-button" type="button" data-cart="mais" data-id="${id}" aria-label="Aumentar quantidade">+</button><button class="remove-button" type="button" data-cart="remover" data-id="${id}">Remover</button></div></div>`
            : `<div class="cart-item"><div></div><div><h3>Produto indisponível (#${id})</h3><p>Remova este item para finalizar.</p></div><button class="remove-button" type="button" data-cart="remover" data-id="${id}">Remover</button></div>`,
        )
        .join("");
      const total = latest.reduce(
        (sum, item) =>
          sum +
          (item.product ? Number(item.product.preco) * item.quantidade : 0),
        0,
      );
      document.querySelector("#cartTotal").textContent = brl(total);
      document.querySelector("#cartSubtotal").textContent = brl(total);
    } catch (e) {
      if (version !== cartVersion) return;
      rows.innerHTML = `<div class="loading-card">${esc(e.message)}</div>`;
      feedback(message, e.message, true);
    }
  }
  rows.addEventListener("click", (e) => {
    const button = e.target.closest("[data-cart]");
    if (!button) return;
    const id = Number(button.dataset.id),
      action = button.dataset.cart,
      cart = getCart(),
      item = cart.find((x) => x.id === id);
    if (!item) return;
    if (action === "remover") saveCart(cart.filter((x) => x.id !== id));
    else if (action === "menos") {
      item.quantidade--;
      saveCart(cart.filter((x) => x.quantidade > 0));
    } else if (action === "mais") {
      const p = latest.find((x) => x.id === id)?.product;
      if (item.quantidade >= Math.min(50, p?.estoque ?? 50)) {
        toast("Quantidade máxima em estoque atingida.", true);
        return;
      }
      item.quantidade++;
      saveCart(cart);
    }
    render();
  });
  document.querySelector("#clearCart")?.addEventListener("click", () => {
    saveCart([]);
    feedback(message, "Carrinho esvaziado.");
    render();
  });
  document
    .querySelector("#checkoutCart")
    ?.addEventListener("click", async (e) => {
      const cart = getCart();
      if (!cart.length) {
        feedback(message, "Adicione produtos primeiro.", true);
        return;
      }
      const button = e.currentTarget;
      button.disabled = true;
      button.textContent = "Registrando...";
      try {
        const data = await request(API("pedido.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itens: cart }),
        });
        saveCart([]);
        await render();
        feedback(
          message,
          `Pedido demonstrativo #${data.pedido} registrado! Total: ${brl(data.total)}. Você pode vê-lo em Meus pedidos.`,
        );
      } catch (err) {
        feedback(
          message,
          err.login
            ? "Faça login para finalizar: abra a página Entrar."
            : err.message,
          true,
        );
      } finally {
        button.disabled = false;
        button.textContent = "Finalizar pedido ↗";
      }
    });
  render();
}
async function initOrders() {
  const list = document.querySelector("#ordersList");
  if (!list) return;
  try {
    const orders = (await request(API("pedido.php"))).pedidos;
    list.innerHTML = orders.length
      ? orders
          .map(
            (o) =>
              `<div class="order-history-row"><div><strong>Pedido #${Number(o.id)}</strong><small>${esc(o.criado_em)}</small></div><span class="status-pill">${esc(o.status)}</span><strong>${brl(o.total)}</strong></div>`,
          )
          .join("")
      : '<div class="empty-state"><strong>Você ainda não fez pedidos.</strong><a href="produtos.html" class="btn primary">Explorar produtos</a></div>';
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><strong>${esc(e.message)}</strong><a href="login.html" class="btn primary">Entrar na conta</a></div>`;
  }
}
function initBooking() {
  const form = document.querySelector("#bookingForm");
  if (!form) return;
  const date = form.querySelector('[name="data_preferida"]');
  const today = new Date();
  const y = today.getFullYear(),
    m = String(today.getMonth() + 1).padStart(2, "0"),
    d = String(today.getDate()).padStart(2, "0");
  date.min = `${y}-${m}-${d}`;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const data = await postForm(API("agendamentos.php"), new FormData(form));
      feedback(document.querySelector("#bookingMessage"), data.mensagem);
      form.reset();
    } catch (error) {
      feedback(document.querySelector("#bookingMessage"), error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}
async function main() {
  initLayout();
  initTheme();
  initNav();
  updateCount();
  if (location.hash === "#cadastro")
    document.querySelector("#cadastro")?.setAttribute("open", "");
  await initUser();
  initForms();
  initBooking();
  await Promise.all([
    initProducts(),
    initCart(),
    initOrders(),
    ...(page === "admin" ? [initAdmin()] : []),
  ]);
}
main().catch((err) => toast(err.message, true));
