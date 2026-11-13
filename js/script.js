const raizSite = new URL('../', document.currentScript.src);

function caminhoSite(caminho) {
  return new URL(caminho, raizSite).href;
}

function selecionar(seletor) {
  return document.querySelector(seletor);
}

let usuarioAtual = null;
let administrador = false;
let tokenCsrf = '';

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
}

// Escapa os caracteres que poderiam virar HTML dentro dos cards.
function texto(valor) {
  if (valor == null) {
    return '';
  }
  let seguro = String(valor);
  seguro = seguro.replaceAll('&', '&amp;');
  seguro = seguro.replaceAll('<', '&lt;');
  seguro = seguro.replaceAll('>', '&gt;');
  seguro = seguro.replaceAll('"', '&quot;');
  return seguro.replaceAll("'", '&#39;');
}

// Lê o JSON e mostra ao código da tela se houve um erro.
async function lerResposta(resposta) {
  let dados;
  try {
    dados = await resposta.json();
  } catch {
    throw new Error('O servidor não respondeu corretamente. Tente novamente.');
  }
  if (!resposta.ok) {
    throw new Error(dados.erro || 'Não foi possível concluir a ação.');
  }
  return dados;
}

// Prepara o pedido e espera o Flask responder.
async function api(caminho, metodo = 'GET', dados) {
  const opcoes = {method: metodo, headers: {}};

  if (metodo !== 'GET') {
    // O Flask pede o token da sessão para aceitar uma mudança.
    if (!tokenCsrf) {
      const respostaToken = await fetch(caminhoSite('api/csrf'));
      const sessao = await lerResposta(respostaToken);
      tokenCsrf = sessao.token;
    }
    opcoes.headers['X-CSRF-Token'] = tokenCsrf;
  }
  if (dados) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(dados);
  }

  const endereco = caminhoSite('api/' + caminho);
  const resposta = await fetch(endereco, opcoes);
  return lerResposta(resposta);
}

let tempoAviso;
// Mostra um recado temporário no site.
function avisar(mensagem) {
  selecionar('#aviso').textContent = mensagem;
  selecionar('#aviso').classList.add('show');
  clearTimeout(tempoAviso);
  tempoAviso = setTimeout(function () {
    selecionar('#aviso').classList.remove('show');
  }, 4500);
}

// Monta o aviso usado quando a lista está vazia.
function vazio(titulo, mensagem) {
  return `<div class="empty">
    <span class="empty-icon" aria-hidden="true">♡</span>
    <h2>${texto(titulo)}</h2><p>${texto(mensagem)}</p>
    <a class="btn" href="${caminhoSite('pages/produtos.html')}">Explorar produtos ↗</a>
  </div>`;
}

// Mostra a quantidade de unidades e o valor total no cabeçalho.
function contador(carrinho) {
  selecionar('#cart-count').textContent = carrinho.quantidade;
  selecionar('#cart-total').textContent = dinheiro(carrinho.total);
  selecionar('.cart-pill').setAttribute('aria-label', 'Carrinho com ' + carrinho.quantidade + ' itens');
}

// Monta o card e guarda o ID do produto no botão de adicionar.
function card(produto, editar) {
  let botoes = '';
  if (editar) {
    botoes = `<div class="product-admin">
      <a href="${caminhoSite('pages/produto.html?id=' + produto.id)}">Editar</a>
      <button class="link-button delete-link" data-excluir="${produto.id}">Excluir</button>
    </div>`;
  }
  return `<article class="product-card">
    <div class="product-image">
      <span class="category-label">${texto(produto.categoria)}</span>
      <img src="${texto(caminhoSite(produto.imagem))}" alt="${texto(produto.nome)}" loading="lazy">
    </div>
    <div class="product-body">
      <h3>${texto(produto.nome)}</h3><p>${texto(produto.descricao)}</p>
      <div class="price-row">
        <strong>${dinheiro(produto.preco)}</strong>
        <button class="add-button" data-adicionar="${produto.id}" aria-label="Adicionar ${texto(produto.nome)} ao carrinho">+</button>
      </div>
      ${botoes}
    </div>
  </article>`;
}

// Busca o catálogo usando os filtros escolhidos na página.
async function carregarProdutos() {
  const busca = selecionar('#busca').value;
  const categoria = selecionar('#categoria').value;
  const filtros = 'busca=' + encodeURIComponent(busca) + '&categoria=' + encodeURIComponent(categoria);
  const produtos = await api('produtos?' + filtros);
  let html = '';
  for (const produto of produtos) {
    html += card(produto, administrador);
  }
  if (produtos.length === 0) {
    html = vazio('Nenhum produto encontrado.', 'Tente outra busca ou categoria.');
  }
  selecionar('#products').innerHTML = html;
  selecionar('#result-count').textContent = produtos.length + ' produto(s) no catálogo';
}

// Mostra até quatro produtos na página inicial.
async function carregarInicio() {
  const produtos = await api('produtos');
  let html = '';
  for (let i = 0; i < produtos.length && i < 4; i++) {
    html += card(produtos[i], false);
  }
  if (produtos.length === 0) {
    html = vazio('Novidades em breve.', 'O catálogo está sendo preparado.');
  }
  selecionar('#home-products').innerHTML = html;
}

// Desenha os itens do carrinho e libera a finalização quando há produtos.
function mostrarCarrinho(carrinho) {
  contador(carrinho);
  selecionar('#order-total').textContent = dinheiro(carrinho.total);
  selecionar('#checkout-button').disabled = carrinho.itens.length === 0;
  let html = '';
  for (const item of carrinho.itens) {
    let bloquearAumento = '';
    if (item.quantidade >= 99) {
      bloquearAumento = 'disabled';
    }
    const subtotal = item.preco * item.quantidade;
    html += `<article class="cart-item">
      <img src="${texto(caminhoSite(item.imagem))}" alt="${texto(item.nome)}">
      <div><h2>${texto(item.nome)}</h2><p>${dinheiro(item.preco)} / unidade</p>
        <div class="quantity">
          <button data-produto="${item.id}" data-quantidade="${item.quantidade - 1}" aria-label="Diminuir quantidade de ${texto(item.nome)}">−</button>
          <span>${item.quantidade}</span>
          <button data-produto="${item.id}" data-quantidade="${item.quantidade + 1}" ${bloquearAumento} aria-label="Aumentar quantidade de ${texto(item.nome)}">+</button>
        </div>
      </div>
      <div class="item-end"><strong>${dinheiro(subtotal)}</strong>
        <button class="link-button" data-produto="${item.id}" data-quantidade="0">Remover</button>
      </div>
    </article>`;
  }
  if (carrinho.itens.length === 0) {
    html = vazio('Ainda cabe muito carinho.', 'Seu carrinho está vazio. Escolha o próximo favorito do seu pet.');
  }
  selecionar('#cart-items').innerHTML = html;
}

// Monta o histórico e abre o pedido indicado na URL.
async function carregarPedidos() {
  const pedidos = await api('pedidos');
  const novo = new URLSearchParams(location.search).get('novo');
  let html = '';
  for (const pedido of pedidos) {
    let itens = '';
    for (const item of pedido.itens) {
      itens += `<div class="order-line"><span>${item.quantidade} × ${texto(item.nome)}</span><strong>${dinheiro(item.preco * item.quantidade)}</strong></div>`;
    }
    const data = new Date(pedido.criado_em.replace(' ', 'T') + 'Z').toLocaleString('pt-BR');
    let aberto = '';
    if (String(pedido.id) === novo) {
      aberto = 'open';
    }
    html += `<details class="order" ${aberto}>
      <summary><div><strong>Pedido #${pedido.id}</strong><small>${data} · ${texto(pedido.nome)}</small></div>
        <span class="badge">Registrado</span><strong>${dinheiro(pedido.total)} ⌄</strong>
      </summary>
      <div class="order-content">${itens}<p class="muted">Pedido demonstrativo. Nenhum pagamento foi cobrado.</p></div>
    </details>`;
  }
  if (pedidos.length === 0) {
    html = vazio('Sua história começa aqui.', 'Os pedidos que você finalizar aparecerão nesta página.');
  }
  selecionar('#orders').innerHTML = html;
}

// Consulta a sessão e ajusta os links e formulários para a conta atual.
async function carregarConta() {
  const usuario = await api('sessao');
  usuarioAtual = usuario;
  administrador = false;
  if (usuario && usuario.admin) {
    administrador = true;
  }
  for (const link of document.querySelectorAll('[data-admin]')) {
    link.hidden = !administrador;
  }
  if (selecionar('#admin-content')) {
    selecionar('#admin-content').hidden = !administrador;
    selecionar('#access-gate').hidden = administrador;
  }
  if (usuario) {
    selecionar('#account-link').textContent = usuario.nome.split(' ')[0] + ' ↗';
  }
  if (selecionar('#account-forms')) {
    selecionar('#account-forms').hidden = usuario !== null;
    selecionar('#logged-in').hidden = !usuario;
    if (usuario) {
      selecionar('#welcome').textContent = 'Olá, ' + usuario.nome + '!';
    }
  }
  if (selecionar('#checkout') && usuario) {
    selecionar('#checkout input').value = usuario.nome;
  }
}

// Preenche o painel com os cadastros, as mensagens e os totais da loja.
async function carregarAdmin() {
  const usuarios = await api('usuarios');
  let html = '<table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Ação</th></tr></thead><tbody>';
  for (const usuario of usuarios) {
    let perfil = 'Cliente';
    if (usuario.admin) {
      perfil = 'Administrador';
    }
    let acao = 'Sua conta';
    if (usuario.id !== usuarioAtual.id) {
      acao = `<button class="link-button delete-link" data-usuario="${usuario.id}">Excluir</button>`;
    }
    html += `<tr><td>${texto(usuario.nome)}</td><td>${texto(usuario.email)}</td><td>${perfil}</td>
      <td>${acao}</td></tr>`;
  }
  html += '</tbody></table>';
  if (usuarios.length === 0) {
    html = '<p>Nenhum usuário cadastrado.</p>';
  }
  selecionar('#users').innerHTML = html;
  const mensagens = await api('contatos');
  html = '';
  for (const mensagem of mensagens) {
    html += `<article class="message-card"><h3>${texto(mensagem.assunto)}</h3>
      <small>${texto(mensagem.nome)} · ${texto(mensagem.email)}</small><p>${texto(mensagem.mensagem)}</p></article>`;
  }
  if (mensagens.length === 0) {
    html = '<p>Nenhuma mensagem recebida.</p>';
  }
  selecionar('#messages').innerHTML = html;
  selecionar('#stat-users').textContent = usuarios.length;
  selecionar('#stat-messages').textContent = mensagens.length;
  const produtos = await api('produtos');
  selecionar('#stat-products').textContent = produtos.length;
}

// Usa o ID da URL para preencher o formulário de edição.
async function carregarEdicao() {
  const id = Number(new URLSearchParams(location.search).get('id'));
  if (!id) {
    return;
  }
  const produtos = await api('produtos');
  for (const produto of produtos) {
    if (produto.id === id) {
      selecionar('#product-title').textContent = 'Editar produto.';
      for (const campo of ['nome', 'categoria', 'descricao', 'preco', 'imagem']) {
        selecionar('#product-form').elements[campo].value = produto[campo];
      }
      atualizarPrevia();
      return;
    }
  }
  selecionar('#product-form').hidden = true;
  avisar('Produto não encontrado. Volte ao catálogo.');
}

function atualizarPrevia() {
  const imagem = selecionar('#product-form').elements.imagem.value;
  selecionar('.product-preview').src = caminhoSite(imagem);
}

// Alterna entre entrar e criar uma conta.
function trocarFormulario(tipo) {
  selecionar('#login-form').hidden = tipo !== 'login';
  selecionar('#register-form').hidden = tipo !== 'register';
  for (const botao of document.querySelectorAll('[data-account]')) {
    botao.setAttribute('aria-pressed', botao.dataset.account === tipo);
  }
}

// Identifica o formulário enviado e mostra a resposta na página.
async function enviarFormulario(evento) {
  evento.preventDefault();
  const form = evento.target;
  const botao = form.querySelector('button[type="submit"]');
  const mensagem = form.querySelector('.form-feedback');
  const rotulo = botao.textContent;
  const dados = {};
  for (const campo of form.elements) {
    if (campo.name && !campo.disabled) {
      dados[campo.name] = campo.value;
    }
  }
  botao.disabled = true;
  botao.textContent = 'Aguarde…';
  if (mensagem) {
    mensagem.textContent = '';
    mensagem.classList.remove('error');
  }
  try {
    if (form.id === 'filters') {
      await carregarProdutos();
    }
    if (form.id === 'register-form') {
      await api('cadastro', 'POST', dados);
      form.reset();
      selecionar('#login-form').elements.email.value = dados.email;
      trocarFormulario('login');
      selecionar('#login-form .form-feedback').textContent = 'Cadastro realizado! Agora entre com seu e-mail e senha.';
      selecionar('#login-form input[name="senha"]').focus();
    }
    if (form.id === 'login-form') {
      await api('login', 'POST', dados);
      tokenCsrf = '';
      await carregarConta();
      const carrinho = await api('carrinho');
      contador(carrinho);
      avisar('Você entrou na PetLife.');
    }
    if (form.id === 'contact-form') {
      await api('contatos', 'POST', dados);
      form.reset();
      mensagem.textContent = 'Mensagem enviada com sucesso!';
    }
    if (form.id === 'checkout') {
      const pedido = await api('pedidos', 'POST', dados);
      form.reset();
      location.href = caminhoSite('pages/pedidos.html?novo=' + pedido.id);
    }
    if (form.id === 'product-form') {
      const id = new URLSearchParams(location.search).get('id');
      if (id) {
        await api('produtos/' + id, 'PUT', dados);
      } else {
        await api('produtos', 'POST', dados);
      }
      location.href = caminhoSite('pages/administracao.html');
    }
  } catch (erro) {
    if (mensagem) {
      mensagem.textContent = erro.message;
      mensagem.classList.add('error');
    }
    else {
      avisar(erro.message);
    }
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

// O ID vem do botão + do card que recebeu o clique.
async function adicionarAoCarrinho(produtoId) {
  const endereco = 'carrinho/' + produtoId;
  const dados = {quantidade: 1};
  const carrinho = await api(endereco, 'POST', dados);

  // O Flask já salvou o item. Agora usamos o total que ele devolveu.
  contador(carrinho);
  animarCarrinho();
  avisar('Produto adicionado ao carrinho.');
}

// Reinicia o destaque do carrinho quando o cliente adiciona outro item.
function animarCarrinho() {
  const icone = selecionar('.cart-pill');
  icone.classList.remove('pulse');
  icone.getBoundingClientRect();
  icone.classList.add('pulse');
}

// Identifica o botão clicado, inclusive nos cards criados depois que a página abriu.
async function clicarBotao(evento) {
  const botao = evento.target.closest('[data-adicionar], [data-excluir], [data-quantidade], [data-usuario], #logout');
  if (!botao || botao.disabled) {
    return;
  }
  botao.disabled = true;
  try {
    if (botao.dataset.adicionar) {
      await adicionarAoCarrinho(botao.dataset.adicionar);
    }
    if (botao.dataset.excluir && confirm('Excluir este produto? Os pedidos anteriores serão mantidos.')) {
      await api('produtos/' + botao.dataset.excluir, 'DELETE');
      await carregarProdutos();
      if (selecionar('#users')) {
        await carregarAdmin();
      }
      const carrinho = await api('carrinho');
      contador(carrinho);
      avisar('Produto excluído.');
    }
    if (botao.hasAttribute('data-quantidade')) {
      const quantidade = Number(botao.dataset.quantidade);
      if (quantidade === 0) {
        const remover = confirm('Remover este produto do carrinho?');
        if (!remover) {
          return;
        }
      }
      const carrinho = await api('carrinho/' + botao.dataset.produto, 'PUT', {quantidade: quantidade});
      mostrarCarrinho(carrinho);
    }
    if (botao.dataset.usuario && confirm('Excluir este cadastro?')) {
      await api('usuarios/' + botao.dataset.usuario, 'DELETE');
      await carregarAdmin();
      await carregarConta();
      avisar('Cadastro excluído.');
    }
    if (botao.id === 'logout') {
      await api('logout', 'POST');
      tokenCsrf = '';
      location.reload();
    }
  } catch (erro) {
    avisar(erro.message);
  } finally {
    botao.disabled = false;
  }
}

// Liga os cliques, os formulários e as animações da página.
function ligarEventos() {
  selecionar('.menu-btn').addEventListener('click', function () {
    const aberto = selecionar('#menu').classList.toggle('open');
    this.setAttribute('aria-expanded', aberto);
    if (aberto) {
      this.setAttribute('aria-label', 'Fechar menu');
    } else {
      this.setAttribute('aria-label', 'Abrir menu');
    }
  });
  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape') {
      selecionar('#menu').classList.remove('open');
      selecionar('.menu-btn').setAttribute('aria-expanded', 'false');
      selecionar('.menu-btn').setAttribute('aria-label', 'Abrir menu');
    }
  });
  document.addEventListener('click', clicarBotao);
  for (const botao of document.querySelectorAll('[data-account]')) {
    botao.addEventListener('click', function () { trocarFormulario(this.dataset.account); });
  }
  if (selecionar('#product-form')) {
    selecionar('#product-form').elements.imagem.addEventListener('change', atualizarPrevia);
  }
  document.addEventListener('click', function (evento) {
    if (!evento.target.closest('.header')) {
      selecionar('#menu').classList.remove('open');
      selecionar('.menu-btn').setAttribute('aria-expanded', 'false');
      selecionar('.menu-btn').setAttribute('aria-label', 'Abrir menu');
    }
  });
  for (const form of document.querySelectorAll('form')) {
    form.addEventListener('submit', enviarFormulario);
  }
  if (selecionar('#categoria')) {
    selecionar('#categoria').addEventListener('change', function () {
      selecionar('#filters').requestSubmit();
    });
  }
  if ('IntersectionObserver' in window) {
    document.body.classList.add('motion-ready');
    const observer = new IntersectionObserver(function (itens) {
      for (const item of itens) {
        if (item.isIntersecting) {
          item.target.classList.add('visible');
          observer.unobserve(item.target);
        }
      }
    });
    for (const bloco of document.querySelectorAll('.reveal')) {
      observer.observe(bloco);
    }
  }
}

// Ao abrir uma página, busca somente os dados que ela mostra.
async function iniciar() {
  ligarEventos();
  try {
    const parametros = new URLSearchParams(location.search);
    const carrinho = await api('carrinho');
    contador(carrinho);
    await carregarConta();
    if (selecionar('#home-products')) {
      await carregarInicio();
    }
    if (selecionar('#products') && (!selecionar('#admin-content') || administrador)) {
      selecionar('#busca').value = parametros.get('busca') || '';
      selecionar('#categoria').value = parametros.get('categoria') || '';
      await carregarProdutos();
      if (parametros.has('buscar')) {
        selecionar('#busca').focus();
      }
    }
    if (selecionar('#cart-items')) {
      mostrarCarrinho(carrinho);
    }
    if (selecionar('#orders')) {
      await carregarPedidos();
    }
    if (selecionar('#users') && administrador) {
      await carregarAdmin();
    }
    if (selecionar('#product-form') && administrador) {
      await carregarEdicao();
    }
    if (selecionar('#contact-form')) {
      selecionar('#contact-form').elements.assunto.value = parametros.get('assunto') || '';
    }
  } catch (erro) {
    avisar('Não foi possível carregar os dados: ' + erro.message);
    for (const bloco of document.querySelectorAll('.loading')) {
      bloco.textContent = 'Não foi possível carregar. Atualize a página para tentar novamente.';
      bloco.classList.remove('loading');
    }
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
