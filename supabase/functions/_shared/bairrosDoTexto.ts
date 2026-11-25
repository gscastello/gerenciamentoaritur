// BAIRROS DE SÃO LUÍS que o leitor do Agendado vê nas instruções (issue #537). Lista FIXA: ela entra no texto da leitura,
// e mexer na tabela de preços (incluir, apagar, renomear) mudava todas as leituras sem ninguém ver — em 25/11 quatro
// bairros apagados na tela trocaram o texto do leitor e invalidaram as leituras guardadas da avaliação. O preço e o nome
// certo continuam vindo da tabela (neighborhood_pricing). Mudar esta lista = rodada COMPLETA da avaliação antes.
export const BAIRROS_DO_TEXTO = (
  "Alameda dos Sonhos, Alemanha, Alto Bonito, Alto da Alegria, Alto da Esperança, Alto da Vitória, Alto do Angelim, " +
  "Alto do Calhau, Alto do Parque Timbira, Alto do Pinho, Alto do Turu, Alto São Francisco, Amapá, Ana Jansen, " +
  "Anajatiua, Ananandiba, Andiroba, Angelim, Anil, Anjo da Guarda, Apeadouro, Apicum, Araçagy, Aracal, Areinha, " +
  "Argola e Tambor, Arraial, Aurora, Bacabalzinho, Bairro de Fátima, Bambuzal, Barés, Barramar, Barreto, Batata, " +
  "Bela Vista, Belira, Bequimão, Bom Jardim, Bom Jesus, Bom Milagre, Bonfim, Brisa do Mar, Cajueiro, Cajupari, " +
  "Cajupe, Calhau, Camboa, Camboa dos Frades, Cantinho do Céu, Canto da Fabril, Caratatiua, Cassaco, Centro, " +
  "Chácara Brasil, Cidade Nova, Cidade Olímpica, Cidade Operária, Cidade Verde, Cinturão Verde, Codozinho, " +
  "Cohab Anil I, Cohab Anil II, Cohab Anil III, Cohab Anil IV, Cohafuma, Cohajap, Cohajoli, Cohama, Cohapam, " +
  "Cohaserma, Cohatrac, Cohatrac I, Cohatrac II, Cohatrac III, Cohatrac IV, Cohatrac V, Coheb do Sacavém, " +
  "Conjunto Basa, Conjunto Belo Horizonte, Conjunto Bom Clima, Conjunto Dom Sebastião, Conjunto dos Ipês, " +
  "Conjunto Irapoã, Conjunto Jaguarema, Conjunto Jardim América, Conjunto Juçara, Conjunto Manoel Beckman, " +
  "Conjunto Newton Bello, Conjunto Penalva, Conjunto Primavera, Conjunto Promorar, Conjunto Reviver, " +
  "Conjunto Rio Anil, Conjunto Santos Dumont, Coqueiro, Coréia, Coreia de Baixo, Coreia de Cima, Coroadinho, Coroado, " +
  "Cruzeiro de Santa Bárbara, Cruzeiro do Anil, Cutim, Desterro, Diamante, Distrito Industrial, Divinéia, " +
  "Eco Tajaçuaba, Estrada da Maioba, Fabril, Fátima, Fé em Deus, Ferventa, Filipinho, Floresta, Forquilha, Fumacê, " +
  "Gancharia, Gapara, Geniparana, Goiabal, Habitacional Nice Lobão, Habitacional Turu, Igaraú, Ilha Bela, " +
  "Ilha da Paz, Inhaúma, Ipase, Ipase de Baixo, Ipase de Cima, Ipem Bequimão, IPEM São Cristóvão, Ipem Turu, Itapera, " +
  "Itapiracó, Itaqui, Jacamim, Jambeiro, Jaracati, Jardim Alvorada, Jardim América, Jardim Atlântico, " +
  "Jardim Coelho Neto, Jardim Conceição, Jardim das Margaridas, Jardim das Palmeiras, Jardim de Alá, " +
  "Jardim de Fátima, Jardim do Ipase, Jardim Eldorado, Jardim Libanês, Jardim Lisboa, Jardim Paulista, " +
  "Jardim Renascença, Jardim Renascença I, Jardim Renascença II, Jardim São Cristóvão, Jardim São Francisco, " +
  "Jardim São Raimundo, Jardim SM II, Jardim Tropical, Jardins São Luís, João de Deus, João Paulo, Jordoa, " +
  "Laranjeiras, Liberdade, Limoeiro, Lira, Litorânea, Livramento, Loteamento Alterosa, Loteamento Aquarelle, " +
  "Loteamento Bom Jesus, Loteamento Canaã, Loteamento Casaca, Macaúba, Madre Deus, Mãe Chica, Maiobão, Maiobinha, " +
  "Mangue Seco, Maranhão Novo, Mata de Itapera, Matinha do Rio Grande, Mato Grosso, Mauro Fecury I, Mauro Fecury II, " +
  "Monte Castelo, Monte das Oliveiras, Morada do Sol, Morro do Zé Bombom, Nova Jerusalém, Nova Metrópoles, " +
  "Novo Angelim, Novo Cohatrac, Novo Horizonte, Olho D'água, Outeiro da Cruz, Pão de Açúcar, Parque Amazonas, " +
  "Parque Athenas, Parque Atlântico, Parque Aurora, Parque das Palmeiras, Parque dos Nobres, Parque dos Sabiás, " +
  "Parque Guanabara, Parque Jaguarema, Parque Nice Lobão, Parque Olinda, Parque Pindorama, Parque Shalon, " +
  "Parque Sielândia, Parque Smithland, Parque Timbiras, Parque Universitário, Parque Vitória, Pedreira, " +
  "Península do Ipase, Piancó, Piçarra, Piçarreira, Pindoba, Piquizeiro, Pirâmide, Pirapora, Planalto Anil, " +
  "Planalto Aurora, Planalto Pingão, Planalto Turu, Planalto Turu II, Planalto Turu III, Planalto Vinhais I, " +
  "Planalto Vinhais II, Ponta da areia, Ponta do Farol, Ponta do São Francisco, Pontal da Ilha, Portelinha, Portinho, " +
  "Porto do Itaqui, Porto Grande, Povoado de Pereira, Praia Grande, Primavera, Quebra Pote, Quintas do Calhau, " +
  "Quitandinha, Radional, Rancho Dom Luís, Recanto da Vila Luizão, Recanto do Turu, Recanto dos Nobres, " +
  "Recanto dos Pássaros, Recanto dos Pássaros (Cidade Operária), Recanto dos Signos, Recanto dos Vinhais, " +
  "Recanto Fialho, Recanto Verde, Redenção, Renascença, Residencial 2000, Residencial Alexandra Tavares, " +
  "Residencial Amendoeiras, Residencial Araras, Residencial Aroeiras, Residencial Batatã, Residencial Canaã, " +
  "Residencial do Careca, Residencial Dom Ricardo, Residencial Esperança, Residencial Estrela Dalva, " +
  "Residencial Farol de São Marcos, Residencial Fonte das Pedras, Residencial Francisco Lima, " +
  "Residencial Ivaldo Rodrigues, Residencial Ivan Sarney, Residencial Jackson Lago, Residencial João Alberto, " +
  "Residencial João do Vale, Residencial Jomar Moraes, Residencial José Reinaldo Tavares, Residencial Luiz Bacelar, " +
  "Residencial Marcelo Dino, Residencial Mato Grosso, Residencial Mirella, Residencial Nestor, Residencial Nova Vida, " +
  "Residencial Novo Renascer, Residencial Novo Turu, Residencial Orquídeas, Residencial Paraíso, Residencial Parati, " +
  "Residencial Piancó, Residencial Pinheiros, Residencial Primavera, Residencial Resende, Residencial Ribeira, " +
  "Residencial Santo Antônio, Residencial Santos Dumont, Residencial São Domingos I, Residencial São Domingos II, " +
  "Residencial São Jerônimo, Residencial São Paulo, Residencial Shalon, Residencial Tadeu Palácio, " +
  "Residencial Tiradentes, Residencial Valean, Residencial Vila Maranhão, Residencial Vinhais II, Retiro Natal, " +
  "Rio Anil, Rio do Meio, Rio dos Cachorros, Rio Grande, Sá Viana, Sacavém, Salina do Sacavém, Santa Bárbara, " +
  "Santa Clara, Santa Cruz, Santa Efigênia, Santa Eulália, Santa Fé, Santa Helena, Santa Rosa, Santo Antônio, " +
  "São Benedito, São Bernardo, São Cristóvão, São Francisco, São Joaquim, São Marcos, São Mateus, São Raimundo, " +
  "São Raimundo do Gapara, Saramanta, Sitinho, Sítio Caracoeiras, Sítio Conceição, Sítio Leal, " +
  "Sítio Pica Pau Amarelo, Sítio São Raimundo, Sítio Tamancão, Sol e Mar, Sol Nascente, Solar dos Lusitanos, Tahim, " +
  "Tajaçuaba, Tajipuru, Tamancão, Tapari, Tauá-Açu, Tibiri, Tibirizinho, Tinaí, Tindiba, Tirirical, " +
  "Trizidela da Maioba, Túnel do Sacavém, Turu, Unidade 101, Unidade 103, Unidade 105, Unidade 201, Unidade 203, " +
  "Unidade 205, Vale Verde, Vera Cruz, Vicente Fialho, Vila 21 de Abril, Vila 25 de Maio, Vila Airton Senna, " +
  "Vila Alexandra Tavares, Vila América, Vila Apaco, Vila Aparecida, Vila Ariri, Vila Bacanga, Vila Bangu, " +
  "Vila Bessa, Vila Brasil, Vila Cabral Miranda, Vila Cascavel, Vila Cerâmica, Vila Collier, Vila Conceição, " +
  "Vila Coquilho, Vila Coquilho 2, Vila Cristalina, Vila Cruzado, Vila da Paz, Vila do Gordo, Vila Dom Luís, " +
  "Vila dos Frades, Vila dos Nobres, Vila Elizeu Matos, Vila Embratel, Vila Esperança, Vila Flamengo, Vila Funil, " +
  "Vila Geniparana, Vila Ilhinha, Vila Industrial, Vila Isabel, Vila Isabel Cafeteira, Vila Ivar Saldanha, Vila Jacu, " +
  "Vila Janaína, Vila Lobão, Vila Luizão, Vila Madureira, Vila Magril, Vila Magril II, Vila Maracujá, Vila Maranhão, " +
  "Vila Mariana, Vila Marinha, Vila Mauro Fecury I, Vila Mauro Fecury II, Vila Menino Jesus de Praga, Vila Militar, " +
  "Vila Muruaí, Vila Natal, Vila Nazaré, Vila Nova, Vila Nova Betel, Vila Nova República, Vila Palmeira, Vila Passos, " +
  "Vila Pavão Filho, Vila Portelinha, Vila Primavera, Vila Real, Vila Rica, Vila Riod, Vila Samara, Vila Santa Júlia, " +
  "Vila Santana, Vila São Francisco, Vila São João, Vila São José, Vila São Luís, Vila São Sebastião, Vila Sarney, " +
  "Vila Sete de Setembro, Vila Tiradentes, Vila União, Vila Vitória, Vila Zenir, Village dos Jasmins, Vinhais, " +
  "Vinhais Velho, Vivendas da Cohama, Vivendas do Turu"
);
