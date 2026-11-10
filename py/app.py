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
pedidos_dao = dao.PedidoDAO(BANCO)
contatos_dao = dao.ContatoDAO(BANCO)

def usuario_atual():
    usuario = flask.session.get('usuario')
    return usuarios.por_id(usuario['id']) if usuario else None

@app.before_request
def proteger():
    # A permissão é conferida no banco em cada requisição protegida.
    caminho = flask.request.path
    metodo = flask.request.method
    admin = (caminho == '/api/painel' or caminho.startswith('/api/usuarios') or
             (caminho == '/api/contatos' and metodo in ('GET', 'HEAD')) or
             (caminho.startswith('/api/produtos') and metodo not in ('GET', 'HEAD', 'OPTIONS')))
    if admin:
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

@app.get('/api/csrf')
def csrf():
    if 'csrf' not in flask.session:
        flask.session['csrf'] = dao.novo_codigo()
    return flask.jsonify(token=flask.session['csrf'])

def dono():
    if 'usuario' in flask.session:
        if usuario_atual():
            return 'usuario:' + str(flask.session['usuario']['id'])
        flask.session.clear()
    if 'visitante' not in flask.session:
        flask.session['visitante'] = dao.novo_codigo()
    return flask.session['visitante']

def dados():
    valor = flask.request.get_json(silent=True)
    if not isinstance(valor, dict):
        raise ValueError('Envie os campos do formulário corretamente.')
    return valor

def email_valido(email):
    partes = email.split('@')
    return len(partes) == 2 and bool(partes[0]) and '.' in partes[1] and not any(letra.isspace() for letra in email)

def campo(d, nome, minimo, maximo):
    valor = d.get(nome, '')
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

@app.get('/api/produtos')
def listar_produtos():
    return flask.jsonify(produtos.listar(flask.request.args.get('busca',''), flask.request.args.get('categoria','')))

@app.post('/api/produtos')
@app.put('/api/produtos/<int:id>')
def salvar_produto(id=None):
    return flask.jsonify(id=produtos.salvar(dados(), id))

@app.delete('/api/produtos/<int:id>')
def excluir_produto(id):
    produtos.excluir(id)
    return flask.jsonify(ok=True)

@app.get('/api/carrinho')
def carrinho():
    return flask.jsonify(loja.carrinho(dono()))

@app.post('/api/carrinho/<int:id>')
@app.put('/api/carrinho/<int:id>')
def alterar_carrinho(id):
    loja.quantidade(dono(), id, dados().get('quantidade',1), flask.request.method == 'POST')
    return flask.jsonify(loja.carrinho(dono()))

@app.get('/api/pedidos')
def pedidos():
    return flask.jsonify(pedidos_dao.pedidos(dono()))

@app.post('/api/pedidos')
def finalizar():
    nome = campo(dados(), 'nome', 2, 100)
    return flask.jsonify(id=pedidos_dao.finalizar(dono(),nome)), 201

@app.get('/api/painel')
def painel():
    return flask.jsonify(pedidos_dao.painel())

@app.get('/api/sessao')
def sessao():
    return flask.jsonify(usuario_atual())

@app.post('/api/cadastro')
def cadastro():
    d = dados()
    nome = campo(d, 'nome', 2, 100)
    email = campo(d, 'email', 3, 150).lower()
    senha = d.get('senha', '')
    if not email_valido(email) or not isinstance(senha, str) or not 8 <= len(senha) <= 128:
        raise ValueError('Confira os dados. Use uma senha entre 8 e 128 caracteres.')
    return flask.jsonify(id=usuarios.cadastrar(nome,email,senha)), 201

@app.post('/api/login')
def login():
    d = dados()
    email = campo(d, 'email', 3, 150)
    senha = d.get('senha', '')
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

@app.route('/api/contatos', methods=['GET','POST'])
def contatos():
    if flask.request.method == 'GET':
        return flask.jsonify(contatos_dao.contatos())
    d = dados()
    valores = [campo(d, 'nome', 2, 100), campo(d, 'email', 3, 150),
               campo(d, 'assunto', 2, 150), campo(d, 'mensagem', 5, 1000)]
    if not email_valido(valores[1]):
        raise ValueError('Preencha todos os campos corretamente.')
    contatos_dao.mensagem(*valores)
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
