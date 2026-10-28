// Estrutura compartilhada por todas as páginas. Carregado antes de script.js.
function initLayout() {
  document.querySelector("[data-header]").outerHTML =
    `<div class="announcement">Seu melhor amigo merece o melhor. <span>Conheça a PetLife.</span></div>
        <header class="header">
            <div class="shell header-inner">
                <a aria-label="PetLife início" class="logo" href="${new URL("index.html", ROOT).href}"><span class="logo-mark">p <span>•</span></span><span>petlife <small>CARINHO EM CADA DETALHE</small></span></a>
                <nav aria-label="Menu principal" class="main-nav" id="mainNav">
                    <a class="" href="${new URL("index.html", ROOT).href}">Início</a>
                    <a class="" href="${new URL("pages/produtos.html", ROOT).href}">Produtos</a>
                    <a class="" href="${new URL("pages/servicos.html", ROOT).href}">Serviços</a>
                    <a class="" href="${new URL("index.html#sobre", ROOT).href}">Sobre</a>
                    <a class="" href="${new URL("pages/contato.html", ROOT).href}">Contato</a>
                </nav>
                <div class="nav-actions">
                    <button aria-label="Alternar tema" class="theme-toggle" id="themeToggle" title="Alternar modo claro/escuro" type="button">◐</button>
                    <a class="account-link" data-account-link="" href="${new URL("pages/login.html", ROOT).href}">Entrar</a>
                    <a aria-label="Ver carrinho" class="cart-link" href="${new URL("pages/carrinho.html", ROOT).href}">Sacola <span id="cartCount">0</span></a>
                    <button aria-controls="mainNav" aria-expanded="false" aria-label="Abrir menu" class="menu-btn" type="button"><span></span><span></span><span></span></button>
                </div>
            </div>
        </header>`;
  document.querySelector("[data-footer]").outerHTML = `<footer class="footer">
            <div class="shell footer-main">
                <div>
                    <a class="logo footer-logo" href="${new URL("index.html", ROOT).href}"><span class="logo-mark">p <span>•</span></span><span>petlife <small>CARINHO EM CADA DETALHE</small></span></a>
                    <p>Mais que uma loja. Um espaço para celebrar o amor pelos pets.</p>
                </div>
                <div>
                    <h3>Explore</h3>
                    <a href="${new URL("pages/produtos.html", ROOT).href}">Produtos</a>
                    <a href="${new URL("pages/servicos.html", ROOT).href}">Serviços</a>
                    <a href="${new URL("index.html#sobre", ROOT).href}">Nossa história</a>
                </div>
                <div>
                    <h3>Sua conta</h3>
                    <a href="${new URL("pages/login.html", ROOT).href}">Entrar</a>
                    <a href="${new URL("pages/carrinho.html", ROOT).href}">Meu carrinho</a>
                    <a href="${new URL("pages/pedidos.html", ROOT).href}">Meus pedidos</a>
                    <a data-admin-link="" hidden="" href="${new URL("pages/admin.html", ROOT).href}">Administração</a>
                </div>
                <div>
                    <h3>Precisa de ajuda?</h3>
                    <a href="${new URL("pages/contato.html", ROOT).href}">Fale conosco</a>
                    <span>Projeto acadêmico demonstrativo</span>
                </div>
            </div>
            <div class="shell footer-bottom">
                <p>© 2026 PetLife. Desenvolvido para fins educacionais.</p>
                <p>Feito com cuidado para quem ama os pets ♡</p>
            </div>
        </footer>`;
  document.querySelectorAll("#mainNav a").forEach((link) => {
    const current = new URL(location.href);
    const target = new URL(link.href);
    const path = current.pathname.endsWith("/")
      ? current.pathname + "index.html"
      : current.pathname;
    if (target.pathname === path && !target.hash) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });
}
