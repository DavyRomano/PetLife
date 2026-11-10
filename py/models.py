class Produto:
    def __init__(self, dados):
        nome = dados.get('nome', '')
        categoria = dados.get('categoria', '')
        descricao = dados.get('descricao', '')
        if not all(isinstance(v, str) for v in (nome, categoria, descricao)):
            raise ValueError('Preencha os campos com texto.')
        nome = nome.strip()
        categoria = categoria.strip()
        try:
            if isinstance(dados.get('preco'), bool):
                raise ValueError()
            preco = float(dados.get('preco', 0))
            if not 0 < preco <= 100000:
                raise ValueError()
            preco = round(preco, 2)
            if preco == 0:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError('Informe um preço válido.')
        if not nome or len(nome) > 150 or categoria not in ['Ração', 'Brinquedo', 'Acessório', 'Higiene']:
            raise ValueError('Confira o nome e a categoria do produto.')
        imagens = ['img/racao.jpg', 'img/bola.jpg', 'img/cama.jpg', 'img/coleira.jpg', 'img/cachorro.jpg', 'img/hero.jpg', 'img/shampoo.jpg']
        imagem = dados.get('imagem', imagens[0])
        if imagem not in imagens:
            raise ValueError('Selecione uma imagem do catálogo.')
        self.nome = nome
        self.categoria = categoria
        if len(descricao) > 1000:
            raise ValueError('A descrição deve ter até 1000 caracteres.')
        self.descricao = descricao.strip()
        self.preco = preco
        self.imagem = imagem


class Pedido:
    def __init__(self, itens):
        self.itens = itens

    def total_centavos(self):
        return sum(round(item['preco'] * 100) * item['quantidade'] for item in self.itens)


class Carrinho:
    def __init__(self, itens):
        self.itens = itens

    def resumo(self):
        return {
            'itens': self.itens,
            'quantidade': sum(item['quantidade'] for item in self.itens),
            'total': Pedido(self.itens).total_centavos() / 100
        }
