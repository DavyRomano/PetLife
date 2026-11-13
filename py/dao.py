import os
import sqlite3
import secrets
import werkzeug.security
from contextlib import contextmanager
from models import Produto

class Banco:
    def __init__(self, caminho):
        self.caminho = caminho

    # Abre a conexão, confirma as mudanças se tudo der certo e desfaz em caso de erro.
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

    # Prepara as tabelas e ajusta bancos de versões anteriores.
    def iniciar(self, pasta):
        novo = not os.path.exists(self.caminho)
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
    # Busca os produtos pelo texto e pela categoria do catálogo.
    def listar(self, busca='', categoria=''):
        with self.conectar() as banco:
            termo = '%' + busca + '%'
            consulta = """SELECT * FROM produtos
                          WHERE (nome LIKE ? OR descricao LIKE ?)
                          AND (? = '' OR categoria = ?) ORDER BY id"""
            # Cada ? recebe o valor da mesma posição na tupla.
            linhas = banco.execute(consulta, (termo, termo, categoria, categoria))
            produtos = []
            for linha in linhas:
                produtos.append(dict(linha))
            return produtos

    # Valida o produto e escolhe entre inserir e atualizar.
    def salvar(self, dados, id=None):
        produto = Produto(dados)
        valores = (produto.nome, produto.categoria, produto.descricao, produto.preco, produto.imagem)
        with self.conectar() as banco:
            if id is None:
                registro = banco.execute('INSERT INTO produtos (nome,categoria,descricao,preco,imagem) VALUES (?,?,?,?,?)', valores)
                return registro.lastrowid
            cursor = banco.execute('UPDATE produtos SET nome=?,categoria=?,descricao=?,preco=?,imagem=? WHERE id=?', valores + (id,))
            if not cursor.rowcount:
                raise ValueError('Produto não encontrado.')
            return id

    def excluir(self, id):
        with self.conectar() as banco:
            if not banco.execute('DELETE FROM produtos WHERE id=?', (id,)).rowcount:
                raise ValueError('Produto não encontrado.')

class LojaDAO(Banco):
    # Ao entrar na conta, juntamos os itens do visitante e transferimos seus pedidos.
    def transferir(self, visitante, usuario):
        with self.conectar() as banco:
            banco.execute('BEGIN IMMEDIATE')
            itens = banco.execute('SELECT produto_id,quantidade FROM carrinho WHERE dono=?', (visitante,)).fetchall()
            for item in itens:
                banco.execute('INSERT INTO carrinho VALUES (?,?,?) ON CONFLICT(dono,produto_id) DO UPDATE SET quantidade=MIN(99,carrinho.quantidade+excluded.quantidade)', (usuario,item['produto_id'],item['quantidade']))
            banco.execute('DELETE FROM carrinho WHERE dono=?', (visitante,))
            banco.execute('UPDATE pedidos SET dono=? WHERE dono=?', (usuario,visitante))

    # Junta os itens do carrinho aos preços do catálogo para calcular os totais.
    def carrinho(self, dono):
        with self.conectar() as banco:
            consulta = """SELECT produtos.*, carrinho.quantidade
                          FROM carrinho JOIN produtos ON produtos.id = carrinho.produto_id
                          WHERE dono = ? ORDER BY produtos.id"""
            itens = []
            for linha in banco.execute(consulta, (dono,)):
                itens.append(dict(linha))
        total = 0
        quantidade = 0
        for produto in itens:
            preco_centavos = round(produto['preco'] * 100)
            subtotal_centavos = preco_centavos * produto['quantidade']
            total += subtotal_centavos
            quantidade += produto['quantidade']
        return {'itens': itens, 'total': total / 100, 'quantidade': quantidade}

    # Valida a quantidade e grava a mudança no item deste dono.
    def quantidade(self, dono, id, quantidade, adicionar=False):
        if type(quantidade) is not int or not 0 <= quantidade <= 99:
            raise ValueError('A quantidade deve estar entre 0 e 99.')
        with self.conectar() as banco:
            produto = banco.execute('SELECT id FROM produtos WHERE id=?', (id,)).fetchone()
            if not produto:
                raise ValueError('Produto não encontrado.')
            if adicionar:
                atual = banco.execute('SELECT quantidade FROM carrinho WHERE dono=? AND produto_id=?', (dono,id)).fetchone()
                if atual:
                    quantidade += atual['quantidade']
            if quantidade > 99:
                raise ValueError('Limite de 99 unidades por produto.')
            if quantidade == 0:
                banco.execute('DELETE FROM carrinho WHERE dono=? AND produto_id=?', (dono,id))
            else:
                # A chave (dono, produto_id) evita duas linhas do mesmo produto no carrinho.
                consulta = """INSERT INTO carrinho VALUES (?,?,?)
                              ON CONFLICT(dono,produto_id)
                              DO UPDATE SET quantidade=excluded.quantidade"""
                banco.execute(consulta, (dono, id, quantidade))

    # Grava o pedido e os itens na mesma transação que esvazia o carrinho.
    def finalizar(self, dono, nome):
        with self.conectar() as banco:
            banco.execute('BEGIN IMMEDIATE')
            # Buscamos o preço atual no banco para calcular o pedido.
            itens = banco.execute('SELECT nome,preco,quantidade FROM carrinho JOIN produtos ON produtos.id=carrinho.produto_id WHERE dono=?', (dono,)).fetchall()
            if not itens:
                raise ValueError('Seu carrinho está vazio.')
            total_centavos = 0
            for item in itens:
                preco_centavos = round(item['preco'] * 100)
                total_centavos += preco_centavos * item['quantidade']

            total_reais = total_centavos / 100
            pedido = banco.execute('INSERT INTO pedidos (dono,nome,total) VALUES (?,?,?)',
                                   (dono, nome, total_reais))
            pedido_id = pedido.lastrowid
            itens_pedido = []
            for item in itens:
                itens_pedido.append((pedido_id, item['nome'], item['preco'], item['quantidade']))
            banco.executemany('INSERT INTO itens_pedido (pedido_id,nome,preco,quantidade) VALUES (?,?,?,?)',
                              itens_pedido)
            # Só limpamos este carrinho depois de gravar todos os itens.
            banco.execute('DELETE FROM carrinho WHERE dono=?', (dono,))
            return pedido_id

    # Monta cada pedido do histórico com os itens comprados.
    def pedidos(self, dono):
        with self.conectar() as banco:
            consulta = 'SELECT id,nome,total,criado_em FROM pedidos WHERE dono=? ORDER BY id DESC'
            consulta_itens = 'SELECT nome,preco,quantidade FROM itens_pedido WHERE pedido_id=?'
            pedidos = []
            for linha in banco.execute(consulta, (dono,)):
                pedido = dict(linha)
                pedido['itens'] = []
                for item in banco.execute(consulta_itens, (pedido['id'],)):
                    pedido['itens'].append(dict(item))
                pedidos.append(pedido)
            return pedidos

class UsuarioDAO(Banco):
    # Busca os dados da conta que podem voltar ao navegador.
    def por_id(self, id):
        with self.conectar() as banco:
            usuario = banco.execute('SELECT id,nome,email,admin FROM usuarios WHERE id=?', (id,)).fetchone()
            if usuario is None:
                return None
            return dict(usuario)

    def promover(self, id):
        with self.conectar() as banco:
            banco.execute('UPDATE usuarios SET admin=1 WHERE id=?', (id,))

    # Salva o hash da senha e avisa se o e-mail já estiver cadastrado.
    def cadastrar(self, nome, email, senha):
        senha_protegida = werkzeug.security.generate_password_hash(senha)
        with self.conectar() as banco:
            try:
                registro = banco.execute('INSERT INTO usuarios (nome,email,senha) VALUES (?,?,?)', (nome, email, senha_protegida))
                return registro.lastrowid
            except sqlite3.IntegrityError:
                raise ValueError('Este e-mail já está cadastrado.')

    def buscar(self, email):
        with self.conectar() as banco:
            usuario = banco.execute('SELECT * FROM usuarios WHERE email=?', (email,)).fetchone()
            if usuario is None:
                return None
            return dict(usuario)

    # Busca a conta pelo e-mail e compara a senha com o hash salvo.
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


# Reutiliza a chave local usada pelo Flask para assinar a sessão.
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
