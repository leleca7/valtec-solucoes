# Central Valtec — Etapa 4: Cliente 360

## Objetivo
Transformar o cadastro de cliente em histórico operacional. Quando um cliente voltar, a equipe deve enxergar o que já aconteceu sem procurar conversas, recibos ou OS em abas diferentes.

## Visão consolidada
Ao abrir o histórico do cliente, a Central reúne:
- dados de contato e endereço;
- equipamentos já atendidos;
- observações internas;
- leads vinculados;
- orçamentos;
- ordens de serviço;
- recebimentos/recibos;
- garantias;
- próxima ação pendente;
- total de serviços registrados;
- identificação de cliente recorrente.

## Linha do tempo
Os eventos são ordenados por data para formar um histórico único. Cada registro mostra tipo de evento, referência, descrição resumida e status.

## Ações diretas
Da visão Cliente 360 é possível:
- abrir o WhatsApp;
- iniciar novo orçamento com os dados do cliente preenchidos;
- iniciar nova OS vinculando o cliente automaticamente.

## Regra de operação
Novo atendimento de cliente recorrente não deve começar do zero. Antes de diagnóstico ou orçamento, a equipe precisa ter acesso aos serviços anteriores, peças/diagnósticos registrados, garantias e observações relevantes.

## Banco
Esta etapa reutiliza os vínculos existentes por `client_id` em leads, orçamentos, ordens de serviço, recibos e garantias. Não cria uma tabela duplicada de histórico.

## Próxima etapa
Valtec Empresas: cadastro B2B, contato responsável, equipamentos/ativos, preventiva, contratos, periodicidade e chamados emergenciais.