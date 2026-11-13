import flask
import dao
import os
import secrets
import sqlite3
import click

app = flask.Flask(__name__, static_folder=None)
PASTA = app.root_path + '/..'
BANCO = os.environ.get('PETLIFE_DB', PASTA + '/petlife.db')

app.secret_key = os.environ.get('PETLIFE_SECRET') or dao.chave(PASTA)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['MAX_CONTENT_LENGTH'] = 65536
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('PETLIFE_HTTPS') == '1'

banco = dao.Banco(BANCO)
banco.iniciar(PASTA)
produtos = dao.ProdutoDAO(BANCO)
loja = dao.LojaDAO(BANCO)
usuarios = dao.UsuarioDAO(BANCO)

# Usamos o ID da sessão para consultar a conta atual no banco.
def usuario_atual():
    usuario = flask.session.get('usuario')
    if usuario:
        return usuarios.por_id(usuario['id'])
    return None

# Confere a permissão das rotas administrativas e o token das alterações.
@app.before_request
def proteger():
    # A permissão é conferida no banco em cada requisição protegida.
    caminho = flask.request.path
    metodo = flask.request.method
    gerencia_usuarios = caminho.startswith('/api/usuarios')
    lista_contatos = caminho == '/api/contatos' and metodo in ('GET', 'HEAD')
    altera_produtos = caminho.startswith('/api/produtos') and metodo not in ('GET', 'HEAD', 'OPTIONS')
    if gerencia_usuarios or lista_contatos or altera_produtos:
        usuario = usuario_atual()
        if not usuario:
            return flask.jsonify(erro='Entre com uma conta de administrador.'), 401
        if not usuario['admin']:
            return flask.jsonify(erro='Acesso permitido apenas a administradores.'), 403
    if caminho.startswith('/api/') and metodo in ('POST', 'PUT', 'DELETE', 'PATCH'):
        token = flask.request.headers.get('X-CSRF-Token', '')
        esperado = flask.session.get('csrf', '')
        if not esperado or not token.isascii() or not secrets.compare_digest(token, esperado):
            return flask.jsonify(erro='Sessão expirada. Atualize a página e tente novamente.'), 403

@app.after_request
def cabecalhos(resposta):
    resposta.headers['X-Content-Type-Options'] = 'nosniff'
    resposta.headers['X-Frame-Options'] = 'DENY'
    resposta.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    resposta.headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    if flask.request.path.startswith('/api/'):
        resposta.headers['Cache-Control'] = 'no-store'
    return resposta

# Entrega ao navegador o token da sessão atual.
@app.get('/api/csrf')
def csrf():
    if 'csrf' not in flask.session:
        flask.session['csrf'] = dao.novo_codigo()
    return flask.jsonify(token=flask.session['csrf'])

# Escolhe a chave que identifica o carrinho e os pedidos desta sessão.
def dono():
    if 'usuario' in flask.session:
        if usuario_atual():
            return 'usuario:' + str(flask.session['usuario']['id'])
        flask.session.clear()
    if 'visitante' not in flask.session:
        flask.session['visitante'] = dao.novo_codigo()
    return flask.session['visitante']

# Lê os campos enviados pelo JavaScript em formato JSON.
def dados():
    valor = flask.request.get_json(silent=True)
    if not isinstance(valor, dict):
        raise ValueError('Envie os campos do formulário corretamente.')
    return valor

def email_valido(email):
    partes = email.split('@')
    if len(partes) != 2:
        return False
    nome, dominio = partes
    if not nome or '.' not in dominio:
        return False
    for letra in email:
        if letra.isspace():
            return False
    return True

# Confere o tamanho do texto antes de usar o campo do formulário.
def campo(formulario, nome, minimo, maximo):
    valor = formulario.get(nome, '')
    if not isinstance(valor, str) or not minimo <= len(valor.strip()) <= maximo:
        raise ValueError('Confira o campo ' + nome + '.')
    return valor.strip()

@app.errorhandler(ValueError)
def erro(erro):
    return flask.jsonify(erro=str(erro)), 400

@app.errorhandler(sqlite3.Error)
def erro_banco(erro):
    app.logger.exception('Erro ao acessar SQLite')
    return flask.jsonify(erro='Não foi possível salvar os dados. Tente novamente.'), 503

@app.errorhandler(413)
def tamanho_excedido(erro):
    return flask.jsonify(erro='Os dados enviados excedem o limite permitido.'), 413

@app.get('/')
@app.get('/index.html')
def inicio():
    return flask.send_from_directory(PASTA, 'index.html')

@app.get('/<pasta>/<path:arquivo>')
def arquivos(pasta, arquivo):
    if pasta not in ('css','js','img','pages'):
        return flask.jsonify(erro='Página não encontrada.'), 404
    return flask.send_from_directory(PASTA + '/' + pasta, arquivo)

@app.get('/produtos.php')
def produtos_antigos():
    return flask.redirect('/pages/produtos.html')

# Pede ao DAO os produtos que atendem aos filtros do catálogo.
@app.get('/api/produtos')
def listar_produtos():
    busca = flask.request.args.get('busca', '')
    categoria = flask.request.args.get('categoria', '')
    return flask.jsonify(produtos.listar(busca, categoria))

# Envia os dados ao DAO para cadastrar ou editar o produto.
@app.post('/api/produtos')
@app.put('/api/produtos/<int:id>')
def salvar_produto(id=None):
    formulario = dados()
    produto_id = produtos.salvar(formulario, id)
    return flask.jsonify(id=produto_id)

@app.delete('/api/produtos/<int:id>')
def excluir_produto(id):
    produtos.excluir(id)
    return flask.jsonify(ok=True)

# Devolve os itens e os totais do carrinho desta sessão.
@app.get('/api/carrinho')
def carrinho():
    dono_carrinho = dono()
    resumo = loja.carrinho(dono_carrinho)
    return flask.jsonify(resumo)

# Recebe a quantidade e devolve o carrinho atualizado.
@app.post('/api/carrinho/<int:id>')
@app.put('/api/carrinho/<int:id>')
def alterar_carrinho(id):
    dono_carrinho = dono()
    formulario = dados()
    quantidade = formulario.get('quantidade', 1)
    # POST soma unidades ao item. PUT define a quantidade escolhida no carrinho.
    adicionar = flask.request.method == 'POST'
    loja.quantidade(dono_carrinho, id, quantidade, adicionar)
    carrinho_atualizado = loja.carrinho(dono_carrinho)
    return flask.jsonify(carrinho_atualizado)

# Busca o histórico de pedidos do dono identificado pela sessão.
@app.get('/api/pedidos')
def pedidos():
    dono_carrinho = dono()
    historico = loja.pedidos(dono_carrinho)
    return flask.jsonify(historico)

# Valida o nome e pede ao DAO que registre a compra.
@app.post('/api/pedidos')
def finalizar():
    formulario = dados()
    nome = campo(formulario, 'nome', 2, 100)
    dono_carrinho = dono()
    pedido_id = loja.finalizar(dono_carrinho, nome)
    return flask.jsonify(id=pedido_id), 201

@app.get('/api/sessao')
def sessao():
    return flask.jsonify(usuario_atual())

# Confere os campos do cadastro antes de enviar a conta ao banco.
@app.post('/api/cadastro')
def cadastro():
    formulario = dados()
    nome = campo(formulario, 'nome', 2, 100)
    email = campo(formulario, 'email', 3, 150).lower()
    senha = formulario.get('senha', '')
    if not email_valido(email) or not isinstance(senha, str) or not 8 <= len(senha) <= 128:
        raise ValueError('Confira os dados. Use uma senha entre 8 e 128 caracteres.')
    usuario_id = usuarios.cadastrar(nome, email, senha)
    return flask.jsonify(id=usuario_id), 201

# Confere as credenciais e inicia a sessão da conta.
@app.post('/api/login')
def login():
    formulario = dados()
    email = campo(formulario, 'email', 3, 150)
    senha = formulario.get('senha', '')
    if not isinstance(senha, str) or not 1 <= len(senha) <= 128:
        raise ValueError('E-mail ou senha incorretos.')
    usuario = usuarios.entrar(email, senha)
    if not usuario:
        raise ValueError('E-mail ou senha incorretos.')
    visitante = dono()
    # Só transfere o carrinho anônimo, nunca o de outra conta.
    if not visitante.startswith('usuario:'):
        loja.transferir(visitante, 'usuario:' + str(usuario['id']))
    flask.session.clear()
    flask.session['csrf'] = dao.novo_codigo()
    flask.session['usuario'] = {
        'id': usuario['id'],
        'nome': usuario['nome'],
        'email': usuario['email']
    }
    return flask.jsonify(usuario_atual())

# Encerra a sessão usada pelo navegador.
@app.post('/api/logout')
def logout():
    flask.session.clear()
    return flask.jsonify(ok=True)

@app.route('/api/usuarios', methods=['GET'])
def listar_usuarios():
    return flask.jsonify(usuarios.listar())

@app.delete('/api/usuarios/<int:id>')
def excluir_usuario(id):
    if usuario_atual()['id'] == id:
        raise ValueError('Você não pode excluir a própria conta administrativa.')
    usuarios.excluir(id)
    return flask.jsonify(ok=True)

# Recebe uma mensagem do formulário ou lista as mensagens para o painel.
@app.route('/api/contatos', methods=['GET','POST'])
def contatos():
    if flask.request.method == 'GET':
        return flask.jsonify(usuarios.contatos())
    formulario = dados()
    nome = campo(formulario, 'nome', 2, 100)
    email = campo(formulario, 'email', 3, 150)
    assunto = campo(formulario, 'assunto', 2, 150)
    mensagem = campo(formulario, 'mensagem', 5, 1000)
    if not email_valido(email):
        raise ValueError('Preencha todos os campos corretamente.')
    usuarios.mensagem(nome, email, assunto, mensagem)
    return flask.jsonify(ok=True),201

@app.cli.command('tornar-admin')
@click.argument('email')
def tornar_admin(email):
    """Promove uma conta cadastrada; disponível apenas no terminal local."""
    usuario = usuarios.buscar(email.strip().lower())
    if not usuario:
        raise click.ClickException('Cadastre essa conta no site primeiro.')
    usuarios.promover(usuario['id'])
    click.echo('Conta promovida a administradora.')


if __name__ == '__main__':
    app.run(port=5000, debug=False)
