<?php
declare(strict_types=1);
require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Database.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Permissions.php';
require_once __DIR__ . '/../modules/companies/CompanyService.php';

Auth::start();
$action=$_GET['action']??'list';
function companyInput():array{$raw=file_get_contents('php://input');if($raw!==false&&trim($raw)!==''){ $j=json_decode($raw,true);if(is_array($j))return $j;}return $_POST;}
function companyData(array $i,bool $create=true):array{
 $d=[
 'razao_social'=>trim((string)($i['razao_social']??'')),'fantasia'=>trim((string)($i['fantasia']??'')),
 'cnpj'=>preg_replace('/\D+/','',(string)($i['cnpj']??'')),'ie'=>preg_replace('/\D+/','',(string)($i['ie']??'')),
 'im'=>preg_replace('/\D+/','',(string)($i['im']??'')),'endereco'=>trim((string)($i['endereco']??'')),
 'numero'=>trim((string)($i['num']??$i['numero']??'')),'complemento'=>trim((string)($i['comp']??$i['complemento']??'')),
 'bairro'=>trim((string)($i['bairro']??'')),'cidade'=>trim((string)($i['cidade']??'')),'uf'=>strtoupper(trim((string)($i['uf']??''))),
 'cep'=>trim((string)($i['cep']??'')),'tipo'=>strtoupper(trim((string)($i['tipo']??'CLI'))),'ramo'=>trim((string)($i['ramo']??'')),
 'telefone'=>trim((string)($i['tel']??$i['telefone']??'')),'email'=>trim((string)($i['email']??'')),'status'=>(string)($i['status']??'active')];
 $errors=[];
 if($d['razao_social']===''||mb_strlen($d['razao_social'])>80)$errors['razao_social']='Informe uma razão social válida.';
 if(!in_array($d['tipo'],['CLI','FOR'],true))$errors['tipo']='Tipo inválido.';
 if($d['uf']!==''&&!preg_match('/^[A-Z]{2}$/',$d['uf']))$errors['uf']='UF inválida.';
 if($d['email']!==''&&!filter_var($d['email'],FILTER_VALIDATE_EMAIL))$errors['email']='E-mail inválido.';
 if(!in_array($d['status'],['active','inactive'],true))$errors['status']='Status inválido.';
 foreach(['fantasia'=>40,'cnpj'=>14,'ie'=>20,'im'=>20,'endereco'=>60,'numero'=>10,'complemento'=>50,'bairro'=>60,'cidade'=>30,'cep'=>10,'ramo'=>80,'telefone'=>20,'email'=>80] as $k=>$max)if(mb_strlen($d[$k])>$max)$errors[$k]='Campo excede o tamanho permitido.';
 if($errors)Response::error('Corrija os campos informados.',422,$errors);
 foreach($d as $k=>$v)if($v==='')$d[$k]=null;
 return $d;
}
try{
 $actor=Auth::requireLogin();$pdo=Database::connection();$s=new CompanyService($pdo);
 if($action==='list'){Permissions::require('companies.view');$page=max(1,(int)($_GET['page']??1));$per=min(100,max(10,(int)($_GET['per_page']??20)));Response::ok($s->list(trim((string)($_GET['field']??'razao_social')),trim((string)($_GET['search']??'')),trim((string)($_GET['status']??'')),$page,$per));}
 if($action==='options'){Permissions::require('products.view');Response::ok(['items'=>$s->options()]);}
 if($action==='get'){Permissions::require('companies.view');$id=(int)($_GET['id']??0);if($id<=0)Response::error('Empresa inválida.',422);$r=$s->get($id);if(!$r)Response::error('Empresa não encontrada.',404);Response::ok($r);}
 if($action==='create'){Permissions::require('companies.create');if($_SERVER['REQUEST_METHOD']!=='POST')Response::error('Método não permitido.',405);Auth::requireCsrf();Response::ok($s->create(companyData(companyInput()),$actor),'Empresa criada com sucesso.');}
 if($action==='update'){Permissions::require('companies.edit');if($_SERVER['REQUEST_METHOD']!=='POST')Response::error('Método não permitido.',405);Auth::requireCsrf();$i=companyInput();$id=(int)($i['id']??0);if($id<=0)Response::error('Empresa inválida.',422);Response::ok($s->update($id,companyData($i,false),$actor),'Empresa atualizada com sucesso.');}
 if($action==='delete'){Permissions::require('companies.delete');if($_SERVER['REQUEST_METHOD']!=='POST')Response::error('Método não permitido.',405);Auth::requireCsrf();$i=companyInput();$id=(int)($i['id']??0);if($id<=0)Response::error('Empresa inválida.',422);Response::ok($s->inactivate($id,$actor),'Empresa inativada.');}
 Response::error('Ação de empresas desconhecida.',404);
}catch(InvalidArgumentException $e){$c=(int)$e->getCode();if($c<400||$c>499)$c=422;Response::error($e->getMessage(),$c);}
catch(PDOException $e){error_log('[SIFLEX4][COMPANIES][DB] '.$e->getMessage());Response::error('Erro ao acessar os dados de empresas.',500);}
catch(Throwable $e){error_log('[SIFLEX4][COMPANIES] '.$e->getMessage());Response::error('Erro interno do servidor.',500);}
