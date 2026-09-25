<?php
declare(strict_types=1);
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Permissions.php';
require_once __DIR__ . '/../modules/products/ProductService.php';

Auth::start();$action=$_GET['action']??'list';
function productInput():array{$raw=file_get_contents('php://input');if($raw!==false&&trim($raw)!==''){ $j=json_decode($raw,true);if(is_array($j))return $j;}return $_POST;}
function productData(array $i):array{
 $d=[
 'company_id'=>isset($i['id_emp'])&&$i['id_emp']!==''?(int)$i['id_emp']:null,'descricao'=>trim((string)($i['descricao']??'')),
 'estoque'=>(float)($i['estoque']??0),'estoque_min'=>(float)($i['estq_min']??$i['estoque_min']??0),'unidade'=>trim((string)($i['unidade']??$i['und']??'UND')),
 'ncm'=>preg_replace('/\D+/','',(string)($i['ncm']??'')),'codigo_interno'=>isset($i['cod_int'])&&$i['cod_int']!==''?(int)$i['cod_int']:null,
 'codigo_barras'=>trim((string)($i['cod_bar']??'')),'codigo_fornecedor'=>trim((string)($i['cod_forn']??'')),'consumo'=>(bool)($i['consumo']??false),
 'custo'=>(float)($i['custo']??0),'markup'=>(float)($i['markup']??0),'local_estoque'=>trim((string)($i['local']??'')),'status'=>(string)($i['status']??'active')];
 $errors=[];
 if($d['descricao']===''||mb_strlen($d['descricao'])>80)$errors['descricao']='Informe uma descrição válida.';
 if($d['estoque']<0||$d['estoque_min']<0)$errors['estoque']='Estoque não pode ser negativo.';
 if($d['unidade']===''||mb_strlen($d['unidade'])>10)$errors['unidade']='Informe uma unidade válida.';
 if(mb_strlen($d['ncm'])>8)$errors['ncm']='NCM inválido.';
 if(mb_strlen($d['codigo_barras'])>20)$errors['codigo_barras']='Código de barras muito longo.';
 if(!in_array($d['status'],['active','inactive'],true))$errors['status']='Status inválido.';
 if($d['company_id']!==null&&$d['company_id']<=0)$errors['company_id']='Fornecedor inválido.';
 if($errors)Response::error('Corrija os campos informados.',422,$errors);
 foreach(['ncm','codigo_barras','codigo_fornecedor','local_estoque'] as $k)if($d[$k]==='')$d[$k]=null;
 return $d;
}
try{
 $actor=Auth::requireLogin();$pdo=Database::connection();$s=new ProductService($pdo);
 if($action==='list'){Permissions::require('products.view');$page=max(1,(int)($_GET['page']??1));$per=min(100,max(10,(int)($_GET['per_page']??20)));Response::ok($s->list(trim((string)($_GET['field']??'descricao')),trim((string)($_GET['search']??'')),trim((string)($_GET['status']??'')),$page,$per));}
 if($action==='get'){Permissions::require('products.view');$id=(int)($_GET['id']??0);if($id<=0)Response::error('Produto inválido.',422);$r=$s->get($id);if(!$r)Response::error('Produto não encontrado.',404);Response::ok($r);}
 if($action==='create'){Permissions::require('products.create');if($_SERVER['REQUEST_METHOD']!=='POST')Response::error('Método não permitido.',405);Auth::requireCsrf();Response::ok($s->create(productData(productInput()),$actor),'Produto criado com sucesso.');}
 if($action==='update'){Permissions::require('products.edit');if($_SERVER['REQUEST_METHOD']!=='POST')Response::error('Método não permitido.',405);Auth::requireCsrf();$i=productInput();$id=(int)($i['id']??0);if($id<=0)Response::error('Produto inválido.',422);Response::ok($s->update($id,productData($i),$actor),'Produto atualizado com sucesso.');}
 if($action==='delete'){Permissions::require('products.delete');if($_SERVER['REQUEST_METHOD']!=='POST')Response::error('Método não permitido.',405);Auth::requireCsrf();$i=productInput();$id=(int)($i['id']??0);if($id<=0)Response::error('Produto inválido.',422);Response::ok($s->inactivate($id,$actor),'Produto inativado.');}
 Response::error('Ação de produtos desconhecida.',404);
}catch(InvalidArgumentException $e){$c=(int)$e->getCode();if($c<400||$c>499)$c=422;Response::error($e->getMessage(),$c);}
catch(PDOException $e){error_log('[SIFLEX4][PRODUCTS][DB] '.$e->getMessage());Response::error('Erro ao acessar os dados de produtos.',500);}
catch(Throwable $e){error_log('[SIFLEX4][PRODUCTS] '.$e->getMessage());Response::error('Erro interno do servidor.',500);}
