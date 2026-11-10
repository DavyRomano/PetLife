const raizSite = new URL('../', document.currentScript.src);

function caminhoSite(caminho) {
  return new URL(caminho, raizSite).href;
}

function selecionar(seletor) {
  return document.querySelector(seletor);
}

const catalogo = new Map();
let usuarioAtual = null;
let tokenCsrf = '';

function dinheiro(valor) {
  return Number(valor).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
}

function texto(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

async function api(caminho, metodo = 'GET', dados) {
  const opcoes = {method: metodo, headers: {}};
  if (metodo !== 'GET') {
    if (!tokenCsrf) tokenCsrf = (await api('csrf')).token;
    opcoes.headers['X-CSRF-Token'] = tokenCsrf;
  }
  if (dados) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(dados);
  }
  const resposta = await fetch(caminhoSite('api/' + caminho), opcoes);
  const resultado = await resposta.json().catch(function () {
    throw new Error('O servidor não respondeu corretamente. Tente novamente.');
  });
  if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível concluir a ação.');
  return resultado;
}

let tempoAviso;
function avisar(mensagem) {
  selecionar('#aviso').textContent = mensagem;
  selecionar('#aviso').classList.add('show');
  clearTimeout(tempoAviso);
  tempoAviso = setTimeout(function () {
    selecionar('#aviso').classList.remove('show');
  }, 4500);
}

function vazio(titulo, mensagem) {
  return `<div class="empty">
    <span class="empty-icon" aria-hidden="true">♡</span>
    <h2>${texto(titulo)}</h2><p>${texto(mensagem)}</p>
    <a class="btn" href="${caminhoSite('pages/produtos.html')}">Explorar produtos ↗</a>
  </div>`;
}

function contador(carrinho) {
  selecionar('#cart-count').textContent = carrinho.quantidade;
  selecionar('#cart-total').textContent = dinheiro(carrinho.total);
  selecionar('.cart-pill').setAttribute('aria-label', 'Carrinho com ' + carrinho.quantidade + ' itens');
}

function card(produto, editar) {
  catalogo.set(produto.id, produto);
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
      <button class="link-button detalhes-link" data-detalhes="${produto.id}">Ver detalhes</button>
      <div class="price-row">
        <strong>${dinheiro(produto.preco)}</strong>
        <button class="add-button" data-adicionar="${produto.id}" aria-label="Adicionar ${texto(produto.nome)} ao carrinho">+</button>
      </div>
      ${botoes}
    </div>
  </article>`;
}

async function carregarProdutos() {
  const busca = selecionar('#busca').value;
  const categoria = selecionar('#categoria').value;
  const produtos = await api('produtos?busca=' + encodeURIComponent(busca) + '&categoria=' + encodeURIComponent(categoria));
  const ordem = selecionar('#ordem').value;
  if (ordem === 'menor') produtos.sort((a, b) => a.preco - b.preco);
  if (ordem === 'maior') produtos.sort((a, b) => b.preco - a.preco);
  if (ordem === 'nome') produtos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  let html = '';
  for (const produto of produtos) html += card(produto, Boolean(usuarioAtual?.admin));
  if (!produtos.length) html = vazio('Nenhum produto encontrado.', 'Tente outra busca ou categoria.');
  selecionar('#products').innerHTML = html;
  selecionar('#result-count').textContent = produtos.length + ' produto(s) no catálogo';
}

async function carregarInicio() {
  const produtos = await api('produtos');
  let html = '';
  for (const produto of produtos.slice(0, 4)) html += card(produto, false);
  if (!produtos.length) html = vazio('Novidades em breve.', 'O catálogo está sendo preparado.');
  selecionar('#home-products').innerHTML = html;
}

function mostrarCarrinho(carrinho) {
  contador(carrinho);
  selecionar('#order-total').textContent = dinheiro(carrinho.total);
  selecionar('#checkout-button').disabled = carrinho.itens.length === 0;
  let html = '';
  for (const item of carrinho.itens) {
    html += `<article class="cart-item">
      <img src="${texto(caminhoSite(item.imagem))}" alt="${texto(item.nome)}">
      <div><h2>${texto(item.nome)}</h2><p>${dinheiro(item.preco)} / unidade</p>
        <div class="quantity">
          <button data-produto="${item.id}" data-quantidade="${item.quantidade - 1}" aria-label="Diminuir quantidade de ${texto(item.nome)}">−</button>
          <span>${item.quantidade}</span>
          <button data-produto="${item.id}" data-quantidade="${item.quantidade + 1}" ${item.quantidade >= 99 ? 'disabled' : ''} aria-label="Aumentar quantidade de ${texto(item.nome)}">+</button>
        </div>
      </div>
      <div class="item-end"><strong>${dinheiro(item.preco * item.quantidade)}</strong>
        <button class="link-button" data-produto="${item.id}" data-quantidade="0">Remover</button>
      </div>
    </article>`;
  }
  if (!carrinho.itens.length) html = vazio('Ainda cabe muito carinho.', 'Seu carrinho está vazio. Escolha o próximo favorito do seu pet.');
  selecionar('#cart-items').innerHTML = html;
}

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
    if (String(pedido.id) === novo) aberto = 'open';
    html += `<details class="order" ${aberto}>
      <summary><div><strong>Pedido #${pedido.id}</strong><small>${data} · ${texto(pedido.nome)}</small></div>
        <span class="badge">Registrado</span><strong>${dinheiro(pedido.total)} ⌄</strong>
      </summary>
      <div class="order-content">${itens}<p class="muted">Pedido demonstrativo. Nenhum pagamento foi cobrado.</p></div>
    </details>`;
  }
  if (!pedidos.length) html = vazio('Sua história começa aqui.', 'Os pedidos que você finalizar aparecerão nesta página.');
  selecionar('#orders').innerHTML = html;
}

async function carregarConta() {
  const usuario = await api('sessao');
  usuarioAtual = usuario;
  for (const link of document.querySelectorAll('[data-admin]')) link.hidden = !usuario?.admin;
  if (selecionar('#admin-content')) {
    selecionar('#admin-content').hidden = !usuario?.admin;
    selecionar('#access-gate').hidden = Boolean(usuario?.admin);
  }
  if (usuario) selecionar('#account-link').textContent = usuario.nome.split(' ')[0] + ' ↗';
  if (selecionar('#account-forms')) {
    selecionar('#account-forms').hidden = Boolean(usuario);
    selecionar('#logged-in').hidden = !usuario;
    if (usuario) selecionar('#welcome').textContent = 'Olá, ' + usuario.nome + '!';
  }
  if (selecionar('#checkout') && usuario) selecionar('#checkout input').value = usuario.nome;
}

async function carregarAdmin() {
  const painel = await api('painel');
  const total = painel.pedidos.reduce((soma, pedido) => soma + Math.round(pedido.total * 100), 0);
  selecionar('#resumo-pedidos').textContent = painel.pedidos.length + ' pedido(s) · Total registrado de ' + dinheiro(total / 100);
  const linhas = painel.pedidos.map(p => `<tr><td>#${p.id}</td><td>${texto(p.nome)}</td><td>${p.unidades}</td><td>${dinheiro(p.total)}</td></tr>`);
  selecionar('#pedidos-loja').innerHTML = linhas.length
    ? '<table><thead><tr><th>Pedido</th><th>Cliente</th><th>Unidades</th><th>Total</th></tr></thead><tbody>' + linhas.join('') + '</tbody></table>'
    : '<p>Ainda não há pedidos finalizados.</p>';
  selecionar('#resumo-categorias').innerHTML = painel.categorias.map(c => `<li>${texto(c.nome)} <b>${c.produtos}</b></li>`).join('');
  const usuarios = await api('usuarios');
  let html = '<table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Ação</th></tr></thead><tbody>';
  for (const usuario of usuarios) {
    html += `<tr><td>${texto(usuario.nome)}</td><td>${texto(usuario.email)}</td><td>${usuario.admin ? 'Administrador' : 'Cliente'}</td>
      <td>${usuario.id === usuarioAtual.id ? 'Sua conta' : `<button class="link-button delete-link" data-usuario="${usuario.id}">Excluir</button>`}</td></tr>`;
  }
  html += '</tbody></table>';
  if (!usuarios.length) html = '<p>Nenhum usuário cadastrado.</p>';
  selecionar('#users').innerHTML = html;
  const mensagens = await api('contatos');
  html = '';
  for (const mensagem of mensagens) {
    html += `<article class="message-card"><h3>${texto(mensagem.assunto)}</h3>
      <small>${texto(mensagem.nome)} · ${texto(mensagem.email)}</small><p>${texto(mensagem.mensagem)}</p></article>`;
  }
  if (!mensagens.length) html = '<p>Nenhuma mensagem recebida.</p>';
  selecionar('#messages').innerHTML = html;
  selecionar('#stat-users').textContent = usuarios.length;
  selecionar('#stat-messages').textContent = mensagens.length;
  selecionar('#stat-products').textContent = (await api('produtos')).length;
}

async function carregarEdicao() {
  const id = Number(new URLSearchParams(location.search).get('id'));
  if (!id) return;
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

function trocarFormulario(tipo) {
  selecionar('#login-form').hidden = tipo !== 'login';
  selecionar('#register-form').hidden = tipo !== 'register';
  for (const botao of document.querySelectorAll('[data-account]')) {
    botao.setAttribute('aria-pressed', botao.dataset.account === tipo ? 'true' : 'false');
  }
}

async function enviarFormulario(evento) {
  evento.preventDefault();
  const form = evento.target;
  const botao = form.querySelector('button[type="submit"]');
  const mensagem = form.querySelector('.form-feedback');
  const rotulo = botao.textContent;
  const dados = {};
  for (const campo of new FormData(form)) dados[campo[0]] = campo[1];
  botao.disabled = true;
  botao.textContent = 'Aguarde…';
  if (mensagem) {
    mensagem.textContent = '';
    mensagem.classList.remove('error');
  }
  try {
    if (form.id === 'filters') await carregarProdutos();
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
      contador(await api('carrinho'));
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
      if (id) await api('produtos/' + id, 'PUT', dados);
      else await api('produtos', 'POST', dados);
      location.href = caminhoSite('pages/administracao.html');
    }
  } catch (erro) {
    if (mensagem) {
      mensagem.textContent = erro.message;
      mensagem.classList.add('error');
    }
    else avisar(erro.message);
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

async function clicarBotao(evento) {
  const botao = evento.target.closest('[data-adicionar], [data-excluir], [data-quantidade], [data-usuario], #logout');
  if (!botao || botao.disabled) return;
  botao.disabled = true;
  try {
    if (botao.dataset.adicionar) {
      contador(await api('carrinho/' + botao.dataset.adicionar, 'POST', {quantidade: 1}));
      selecionar('.cart-pill').classList.remove('pulse');
      void selecionar('.cart-pill').offsetWidth;
      selecionar('.cart-pill').classList.add('pulse');
      if (selecionar('#detalhe')?.open) selecionar('#detalhe').close();
      avisar('Produto adicionado ao carrinho.');
    }
    if (botao.dataset.excluir && confirm('Excluir este produto? Os pedidos anteriores serão mantidos.')) {
      await api('produtos/' + botao.dataset.excluir, 'DELETE');
      await carregarProdutos();
      if (selecionar('#users')) await carregarAdmin();
      contador(await api('carrinho'));
      avisar('Produto excluído.');
    }
    if (botao.dataset.quantidade !== undefined) {
      if (Number(botao.dataset.quantidade) === 0 && !confirm('Remover este produto do carrinho?')) return;
      const carrinho = await api('carrinho/' + botao.dataset.produto, 'PUT', {quantidade: Number(botao.dataset.quantidade)});
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

async function iniciar() {
  selecionar('.menu-btn').addEventListener('click', function () {
    const aberto = selecionar('#menu').classList.toggle('open');
    this.setAttribute('aria-expanded', aberto);
    this.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
  });
  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape') {
      selecionar('#menu').classList.remove('open');
      selecionar('.menu-btn').setAttribute('aria-expanded', 'false');
      selecionar('.menu-btn').setAttribute('aria-label', 'Abrir menu');
    }
  });
  const detalhe = selecionar('#detalhe');
  if (detalhe) {
    detalhe.querySelector('.fechar').addEventListener('click', () => detalhe.close());
    document.addEventListener('click', evento => {
      const botao = evento.target.closest('[data-detalhes]');
      if (!botao) return;
      const produto = catalogo.get(Number(botao.dataset.detalhes));
      selecionar('#detalhe-foto').src = caminhoSite(produto.imagem);
      for (const campo of ['categoria', 'nome', 'descricao']) {
        selecionar('#detalhe-' + campo).textContent = produto[campo];
      }
      selecionar('#detalhe-preco').textContent = dinheiro(produto.preco);
      selecionar('#detalhe-adicionar').dataset.adicionar = produto.id;
      detalhe.showModal();
    });
  }
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
  for (const form of document.querySelectorAll('form')) form.addEventListener('submit', enviarFormulario);
  if (selecionar('#categoria')) {
    selecionar('#ordem').addEventListener('change', () => selecionar('#filters').requestSubmit());
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
    for (const bloco of document.querySelectorAll('.reveal')) observer.observe(bloco);
  }
  try {
    const parametros = new URLSearchParams(location.search);
    const carrinho = await api('carrinho');
    contador(carrinho);
    await carregarConta();
    if (selecionar('#home-products')) await carregarInicio();
    if (selecionar('#products') && (!selecionar('#admin-content') || usuarioAtual?.admin)) {
      selecionar('#busca').value = parametros.get('busca') || '';
      selecionar('#categoria').value = parametros.get('categoria') || '';
      await carregarProdutos();
      if (parametros.has('buscar')) selecionar('#busca').focus();
    }
    if (selecionar('#cart-items')) mostrarCarrinho(carrinho);
    if (selecionar('#orders')) await carregarPedidos();
    if (selecionar('#users') && usuarioAtual?.admin) await carregarAdmin();
    if (selecionar('#product-form') && usuarioAtual?.admin) await carregarEdicao();
    if (selecionar('#contact-form')) selecionar('#contact-form').elements.assunto.value = parametros.get('assunto') || '';
  } catch (erro) {
    avisar('Não foi possível carregar os dados: ' + erro.message);
    for (const bloco of document.querySelectorAll('.loading')) {
      bloco.textContent = 'Não foi possível carregar. Atualize a página para tentar novamente.';
      bloco.classList.remove('loading');
    }
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
