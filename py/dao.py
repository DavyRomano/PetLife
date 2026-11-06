import sqlite3
import secrets
import werkzeug.security
from contextlib import contextmanager
from models import Produto

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
        try:
            with open(self.caminho, 'rb'):
                novo = False
        except FileNotFoundError:
            novo = True
        with self.conectar() as banco:
            with open(pasta + '/sql/petlife.sql', encoding='utf-8') as arquivo:
                banco.executescript(arquivo.read())
            colunas = [c['name'] for c in banco.execute('PRAGMA table_info(usuarios)')]
            if 'admin' not in colunas:
                banco.execute('ALTER TABLE usuarios ADD COLUMN admin INTEGER NOT NULL DEFAULT 0 CHECK(admin IN (0,1))')
            banco.execute("UPDATE produtos SET imagem='img/racao.jpg' WHERE imagem='img/raçao.jpg'")
            if novo:
                banco.executemany('INSERT INTO produtos (nome,categoria,descricao,preco,imagem) VALUES (?,?,?,?,?)', [
                    ('Ração Premium Gatos','Ração','Ração para gatos adultos.',74.90,'img/racao.jpg'),
                    ('Bola Interativa','Brinquedo','Bola para estimular a brincadeira.',34.90,'img/bola.jpg'),
                    ('Cama Confortável','Acessório','Cama macia para descanso.',119.90,'img/cama.jpg'),
                    ('Coleira PetLife','Acessório','Coleira confortável para passeios.',39.90,'img/coleira.jpg'),
                    ('Shampoo Pet','Higiene','Cuidado para a hora do banho. Produto e imagem ilustrativos.',29.90,'img/shampoo.jpg')])
            versao = banco.execute('PRAGMA user_version').fetchone()[0]
            if versao < 2:
                if not banco.execute("SELECT id FROM produtos WHERE categoria='Higiene'").fetchone():
                    banco.execute('INSERT INTO produtos (nome,categoria,descricao,preco,imagem) VALUES (?,?,?,?,?)',
                                  ('Shampoo Pet','Higiene','Cuidado para a hora do banho. Produto e imagem ilustrativos.',29.90,'img/shampoo.jpg'))
                banco.execute('PRAGMA user_version = 2')

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
            itens = [dict(p) for p in banco.execute('SELECT produtos.*, carrinho.quantidade FROM carrinho JOIN produtos ON produtos.id=carrinho.produto_id WHERE dono=? ORDER BY produtos.id', (dono,))]
        total = 0
        quantidade = 0
        for produto in itens:
            total += round(produto['preco'] * 100) * produto['quantidade']
            quantidade += produto['quantidade']
        return {'itens': itens, 'total': total / 100, 'quantidade': quantidade}

    def quantidade(self, dono, id, quantidade, adicionar=False):
        if type(quantidade) is not int or not 0 <= quantidade <= 99:
            raise ValueError('A quantidade deve estar entre 0 e 99.')
        with self.conectar() as banco:
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

    def finalizar(self, dono, nome):
        with self.conectar() as banco:
            banco.execute('BEGIN IMMEDIATE')
            itens = banco.execute('SELECT nome,preco,quantidade FROM carrinho JOIN produtos ON produtos.id=carrinho.produto_id WHERE dono=?', (dono,)).fetchall()
            if not itens:
                raise ValueError('Seu carrinho está vazio.')
            total = 0
            for item in itens:
                total += round(item['preco'] * 100) * item['quantidade']
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
