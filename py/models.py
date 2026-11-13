class Produto:
    # Confere os dados do formulário antes de montar o produto que o DAO vai salvar.
    def __init__(self, dados):
        nome = dados.get('nome', '')
        categoria = dados.get('categoria', '')
        descricao = dados.get('descricao', '')
        if not isinstance(nome, str) or not isinstance(categoria, str) or not isinstance(descricao, str):
            raise ValueError('Preencha os campos com texto.')
        nome = nome.strip()
        categoria = categoria.strip()
        valor = dados.get('preco', 0)
        if isinstance(valor, bool):
            raise ValueError('Informe um preço válido.')
        try:
            preco = float(valor)
        except (ValueError, TypeError):
            raise ValueError('Informe um preço válido.')
        if not 0 < preco <= 100000:
            raise ValueError('Informe um preço válido.')
        preco = round(preco, 2)
        if preco == 0:
            raise ValueError('Informe um preço válido.')
        categorias = ['Ração', 'Brinquedo', 'Acessório', 'Higiene']
        if not nome or len(nome) > 150 or categoria not in categorias:
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
