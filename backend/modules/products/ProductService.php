<?php
declare(strict_types=1);

final class ProductService
{
    public function __construct(private PDO $pdo) {}

    public function list(string $field,string $search,string $status,int $page,int $perPage): array {
        $where=['1=1']; $params=[];
        if($status!==''){ $where[]='p.status=:status'; $params['status']=$status; }
        switch($field){
            case 'cod_int':
                if($search!==''){ $where[]='p.codigo_interno=:code'; $params['code']=(int)$search; } break;
            case 'cod_forn': if($search!==''){ $where[]='p.codigo_fornecedor LIKE :search'; $params['search']='%'.$search.'%'; } break;
            case 'cod_bar': if($search!==''){ $where[]='p.codigo_barras LIKE :search'; $params['search']='%'.$search.'%'; } break;
            case 'consumo': $where[]='p.consumo=1'; break;
            case 'estoque_baixo': $where[]='p.estoque <= p.estoque_min'; break;
            case 'fornecedor': if($search!==''){ $where[]='(c.fantasia LIKE :search OR c.razao_social LIKE :search)'; $params['search']='%'.$search.'%'; } break;
            default: if($search!==''){ $where[]='p.descricao LIKE :search'; $params['search']='%'.$search.'%'; }
        }
        $ws=implode(' AND ',$where);
        $count=$this->pdo->prepare("SELECT COUNT(*) FROM products p LEFT JOIN companies c ON c.id=p.company_id WHERE $ws"); $count->execute($params);
        $total=(int)$count->fetchColumn(); $pages=max(1,(int)ceil($total/$perPage)); $page=min(max(1,$page),$pages); $offset=($page-1)*$perPage;
        $sql="SELECT p.id,p.company_id AS id_emp,p.descricao,p.estoque,p.estoque_min AS estq_min,p.unidade,p.ncm,p.codigo_interno AS cod_int,p.codigo_barras AS cod_bar,p.codigo_fornecedor AS cod_forn,p.consumo,p.custo,p.markup,p.local_estoque AS local,p.status,c.fantasia AS fornecedor_nome,
        COALESCE((SELECT SUM(r.quantity) FROM product_reservations r WHERE r.product_id=p.id AND r.status='active'),0) AS reserva
        FROM products p LEFT JOIN companies c ON c.id=p.company_id WHERE $ws ORDER BY p.descricao,p.id LIMIT :limit OFFSET :offset";
        $stmt=$this->pdo->prepare($sql); foreach($params as $k=>$v)$stmt->bindValue(':'.$k,$v); $stmt->bindValue(':limit',$perPage,PDO::PARAM_INT);$stmt->bindValue(':offset',$offset,PDO::PARAM_INT);$stmt->execute();
        $items=$stmt->fetchAll(PDO::FETCH_ASSOC); foreach($items as &$i){$i['disponivel']=(float)$i['estoque']-(float)$i['reserva'];} unset($i);
        return ['items'=>$items,'page'=>$page,'per_page'=>$perPage,'total'=>$total,'total_pages'=>$pages];
    }

    public function get(int $id): ?array {
        $s=$this->pdo->prepare('SELECT p.id,p.company_id AS id_emp,p.descricao,p.estoque,p.estoque_min AS estq_min,p.unidade,p.ncm,p.codigo_interno AS cod_int,p.codigo_barras AS cod_bar,p.codigo_fornecedor AS cod_forn,p.consumo,p.custo,p.markup,p.local_estoque AS local,p.status FROM products p WHERE p.id=? LIMIT 1');$s->execute([$id]);$r=$s->fetch(PDO::FETCH_ASSOC);return $r?:null;
    }
    public function create(array $d,int $actor):array{return $this->save(0,$d,$actor);}
    public function update(int $id,array $d,int $actor):array{if(!$this->get($id))throw new InvalidArgumentException('Produto não encontrado.',404);return $this->save($id,$d,$actor);}
    private function save(int $id,array $d,int $actor):array{
        $old=$id?$this->get($id):null;
        if($id){
            $s=$this->pdo->prepare('UPDATE products SET company_id=:company_id,descricao=:descricao,estoque=:estoque,estoque_min=:estoque_min,unidade=:unidade,ncm=:ncm,codigo_interno=:codigo_interno,codigo_barras=:codigo_barras,codigo_fornecedor=:codigo_fornecedor,consumo=:consumo,custo=:custo,markup=:markup,local_estoque=:local_estoque,status=:status WHERE id=:id');$d['id']=$id;$s->execute($d);
        }else{
            $s=$this->pdo->prepare('INSERT INTO products (company_id,descricao,estoque,estoque_min,unidade,ncm,codigo_interno,codigo_barras,codigo_fornecedor,consumo,custo,markup,local_estoque,status) VALUES (:company_id,:descricao,:estoque,:estoque_min,:unidade,:ncm,:codigo_interno,:codigo_barras,:codigo_fornecedor,:consumo,:custo,:markup,:local_estoque,:status)');$s->execute($d);$id=(int)$this->pdo->lastInsertId();
        }
        $new=$this->get($id);$this->audit($actor,$id,$old,$new,$old?'update':'create');return $new;
    }
    public function inactivate(int $id,int $actor):array{$old=$this->get($id);if(!$old)throw new InvalidArgumentException('Produto não encontrado.',404);$s=$this->pdo->prepare("UPDATE products SET status='inactive' WHERE id=?");$s->execute([$id]);$new=$this->get($id);$this->audit($actor,$id,$old,$new,'delete');return $new;}
    private function audit(int $actor,int $id,?array $old,?array $new,string $action):void{$s=$this->pdo->prepare('INSERT INTO audit_logs (user_id,module_code,action,entity_type,entity_id,old_data,new_data,ip_address) VALUES (?,?,?,?,?,?,?,?)');$s->execute([$actor,'PRODUTOS',$action,'product',(string)$id,$old?json_encode($old,JSON_UNESCAPED_UNICODE):null,$new?json_encode($new,JSON_UNESCAPED_UNICODE):null,$_SERVER['REMOTE_ADDR']??null]);}
}
