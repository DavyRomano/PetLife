import sqlite3
import secrets
import werkzeug.security
from contextlib import contextmanager
from models import Produto, Carrinho, Pedido

class Banco:
    def __init__(self, caminho):
        self.caminho = caminho

    @contextmanager
    def conectar(self):
        banco = sqlite3.connect(self.caminho)
        banco.row_factory = sqlite3.Row
        banco.execute('PRAGMA foreign_keys = ON')
        try:
            with banco:
                yield banco
        finally:
            banco.close()

    def iniciar(self, pasta):
        with open(pasta + '/sql/petlife.sql', encoding='utf-8') as arquivo:
            estrutura, catalogo = arquivo.read().split('-- Catálogo inicial')
        with self.conectar() as banco:
            banco.execute('PRAGMA foreign_keys = OFF')
            banco.execute('BEGIN IMMEDIATE')
            if banco.execute('PRAGMA user_version').fetchone()[0] >= 3:
                return
            antigo = banco.execute("SELECT 1 FROM sqlite_master WHERE name='produtos'").fetchone()
            # O banco antigo guardava a categoria sem chave estrangeira.
            comando = ''
            for linha in estrutura.splitlines(True):
                comando += linha
                if sqlite3.complete_statement(comando):
                    banco.execute(comando)
                    comando = ''
            if antigo:
                banco.execute('INSERT OR IGNORE INTO categorias SELECT DISTINCT categoria FROM produtos')
                banco.execute("""CREATE TABLE produtos_novos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
                    categoria TEXT NOT NULL REFERENCES categorias(nome), descricao TEXT,
                    preco REAL NOT NULL CHECK(preco > 0), imagem TEXT)""")
                banco.execute('INSERT INTO produtos_novos SELECT id,nome,categoria,descricao,preco,imagem FROM produtos')
                banco.execute('DROP TABLE produtos')
                banco.execute('ALTER TABLE produtos_novos RENAME TO produtos')
                banco.execute("UPDATE produtos SET imagem='img/racao.jpg' WHERE imagem='img/raçao.jpg'")
                if 'admin' not in [c['name'] for c in banco.execute('PRAGMA table_info(usuarios)')]:
                    banco.execute('ALTER TABLE usuarios ADD COLUMN admin INTEGER NOT NULL DEFAULT 0 CHECK(admin IN (0,1))')
            else:
                banco.execute(catalogo)
            if banco.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('O banco contém um relacionamento inválido.')
            banco.execute('PRAGMA user_version = 3')


class ProdutoDAO(Banco):
    def listar(self, busca='', categoria=''):
        with self.conectar() as banco:
            return [dict(p) for p in banco.execute('SELECT * FROM produtos WHERE (nome LIKE ? OR descricao LIKE ?) AND (? = \'\' OR categoria = ?) ORDER BY id', ('%'+busca+'%', '%'+busca+'%', categoria, categoria))]

    def salvar(self, dados, id=None):
        produto = Produto(dados)
        valores = (produto.nome, produto.categoria, produto.descricao, produto.preco, produto.imagem)
        with self.conectar() as banco:
            if id is None:
                return banco.execute('INSERT INTO produtos (nome,categoria,descricao,preco,imagem) VALUES (?,?,?,?,?)', valores).lastrowid
            cursor = banco.execute('UPDATE produtos SET nome=?,categoria=?,descricao=?,preco=?,imagem=? WHERE id=?', valores + (id,))
            if not cursor.rowcount:
                raise ValueError('Produto não encontrado.')
            return id

    def excluir(self, id):
        with self.conectar() as banco:
            if not banco.execute('DELETE FROM produtos WHERE id=?', (id,)).rowcount:
                raise ValueError('Produto não encontrado.')

class LojaDAO(Banco):
    def transferir(self, visitante, usuario):
        with self.conectar() as banco:
            banco.execute('BEGIN IMMEDIATE')
            itens = banco.execute('SELECT produto_id,quantidade FROM carrinho WHERE dono=?', (visitante,)).fetchall()
            for item in itens:
                banco.execute('INSERT INTO carrinho VALUES (?,?,?) ON CONFLICT(dono,produto_id) DO UPDATE SET quantidade=MIN(99,carrinho.quantidade+excluded.quantidade)', (usuario,item['produto_id'],item['quantidade']))
            banco.execute('DELETE FROM carrinho WHERE dono=?', (visitante,))
            banco.execute('UPDATE pedidos SET dono=? WHERE dono=?', (usuario,visitante))

    def carrinho(self, dono):
        with self.conectar() as banco:
            itens = [dict(p) for p in banco.execute('SELECT produtos.*, carrinho.quantidade FROM carrinho INNER JOIN produtos ON produtos.id=carrinho.produto_id WHERE dono=? ORDER BY produtos.id', (dono,))]
        return Carrinho(itens).resumo()

    def quantidade(self, dono, id, quantidade, adicionar=False):
        if type(quantidade) is not int or not 0 <= quantidade <= 99:
            raise ValueError('A quantidade deve estar entre 0 e 99.')
        with self.conectar() as banco:
            banco.execute('BEGIN IMMEDIATE')
            if not banco.execute('SELECT id FROM produtos WHERE id=?', (id,)).fetchone():
                raise ValueError('Produto não encontrado.')
            if adicionar:
                atual = banco.execute('SELECT quantidade FROM carrinho WHERE dono=? AND produto_id=?', (dono,id)).fetchone()
                quantidade += atual['quantidade'] if atual else 0
            if quantidade > 99:
                raise ValueError('Limite de 99 unidades por produto.')
            if quantidade == 0:
                banco.execute('DELETE FROM carrinho WHERE dono=? AND produto_id=?', (dono,id))
            else:
                banco.execute('INSERT INTO carrinho VALUES (?,?,?) ON CONFLICT(dono,produto_id) DO UPDATE SET quantidade=excluded.quantidade', (dono,id,quantidade))


class PedidoDAO(Banco):
    def finalizar(self, dono, nome):
        with self.conectar() as banco:
            banco.execute('BEGIN IMMEDIATE')
            itens = banco.execute('SELECT nome,preco,quantidade FROM carrinho INNER JOIN produtos ON produtos.id=carrinho.produto_id WHERE dono=?', (dono,)).fetchall()
            if not itens:
                raise ValueError('Seu carrinho está vazio.')
            total = Pedido(itens).total_centavos()
            id = banco.execute('INSERT INTO pedidos (dono,nome,total) VALUES (?,?,?)', (dono,nome,total / 100)).lastrowid
            banco.executemany('INSERT INTO itens_pedido (pedido_id,nome,preco,quantidade) VALUES (?,?,?,?)', [(id,p['nome'],p['preco'],p['quantidade']) for p in itens])
            banco.execute('DELETE FROM carrinho WHERE dono=?', (dono,))
            return id

    def pedidos(self, dono):
        with self.conectar() as banco:
            pedidos = [dict(p) for p in banco.execute('SELECT * FROM pedidos WHERE dono=? ORDER BY id DESC', (dono,))]
            for pedido in pedidos:
                pedido.pop('dono')
                pedido['itens'] = [dict(p) for p in banco.execute('SELECT nome,preco,quantidade FROM itens_pedido WHERE pedido_id=?', (pedido['id'],))]
            return pedidos

    def painel(self):
        with self.conectar() as banco:
            consulta = """SELECT p.id, p.nome, p.total, p.criado_em,
                                 COALESCE(SUM(i.quantidade), 0) AS unidades
                          FROM pedidos p LEFT JOIN itens_pedido i ON i.pedido_id = p.id
                          GROUP BY p.id ORDER BY p.id DESC"""
            categorias = """SELECT c.nome, COUNT(p.id) AS produtos FROM categorias c
                            LEFT JOIN produtos p ON p.categoria = c.nome
                            GROUP BY c.nome ORDER BY c.nome"""
            return {'pedidos': [dict(p) for p in banco.execute(consulta)],
                    'categorias': [dict(c) for c in banco.execute(categorias)]}


class UsuarioDAO(Banco):
    def por_id(self, id):
        with self.conectar() as banco:
            usuario = banco.execute('SELECT id,nome,email,admin FROM usuarios WHERE id=?', (id,)).fetchone()
            return dict(usuario) if usuario else None

    def promover(self, id):
        with self.conectar() as banco:
            banco.execute('UPDATE usuarios SET admin=1 WHERE id=?', (id,))

    def cadastrar(self, nome, email, senha):
        senha = werkzeug.security.generate_password_hash(senha)
        with self.conectar() as banco:
            try:
                return banco.execute('INSERT INTO usuarios (nome,email,senha) VALUES (?,?,?)', (nome,email,senha)).lastrowid
            except sqlite3.IntegrityError:
                raise ValueError('Este e-mail já está cadastrado.')

    def buscar(self, email):
        with self.conectar() as banco:
            usuario = banco.execute('SELECT * FROM usuarios WHERE email=?', (email,)).fetchone()
            return dict(usuario) if usuario else None

    def entrar(self, email, senha):
        usuario = self.buscar(str(email).strip().lower())
        if usuario and werkzeug.security.check_password_hash(usuario['senha'], str(senha)):
            return usuario
        return None

    def listar(self):
        with self.conectar() as banco:
            return [dict(u) for u in banco.execute('SELECT id,nome,email,admin,criado_em FROM usuarios ORDER BY id DESC')]

    def excluir(self, id):
        with self.conectar() as banco:
            if not banco.execute('DELETE FROM usuarios WHERE id=?', (id,)).rowcount:
                raise ValueError('Usuário não encontrado.')
            banco.execute('DELETE FROM carrinho WHERE dono=?', ('usuario:'+str(id),))


class ContatoDAO(Banco):
    def mensagem(self, nome, email, assunto, mensagem):
        with self.conectar() as banco:
            banco.execute('INSERT INTO contatos (nome,email,assunto,mensagem) VALUES (?,?,?,?)', (nome,email,assunto,mensagem))

    def contatos(self):
        with self.conectar() as banco:
            return [dict(c) for c in banco.execute('SELECT * FROM contatos ORDER BY id DESC')]


def novo_codigo():
    return secrets.token_hex(24)


def chave(pasta):
    arquivo = pasta + '/.chave_sessao'
    try:
        with open(arquivo, encoding='utf-8') as leitura:
            return leitura.read()
    except FileNotFoundError:
        valor = novo_codigo()
        with open(arquivo, 'w', encoding='utf-8') as escrita:
            escrita.write(valor)
        return valor
