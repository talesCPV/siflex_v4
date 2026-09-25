<?php
declare(strict_types=1);

final class CompanyService
{
    public function __construct(private PDO $pdo) {}

    public function list(string $field, string $search, string $status, int $page, int $perPage): array
    {
        $allowed = [
            'id' => 'c.id', 'razao_social' => 'c.razao_social', 'fantasia' => 'c.fantasia',
            'cnpj' => 'c.cnpj', 'ie' => 'c.ie', 'tipo' => 'c.tipo', 'ramo' => 'c.ramo'
        ];
        $field = $allowed[$field] ?? $allowed['razao_social'];
        $where = ['1=1']; $params = [];
        if ($status !== '') { $where[] = 'c.status = :status'; $params['status']=$status; }
        if ($search !== '') {
            if ($field === 'c.id') { $where[] = 'c.id = :search_id'; $params['search_id']=(int)$search; }
            elseif ($field === 'c.tipo') { $where[] = 'c.tipo = :search_type'; $params['search_type']=strtoupper($search); }
            else { $where[] = "$field LIKE :search"; $params['search']='%'.$search.'%'; }
        }
        $whereSql=implode(' AND ',$where);
        $count=$this->pdo->prepare("SELECT COUNT(*) FROM companies c WHERE $whereSql"); $count->execute($params);
        $total=(int)$count->fetchColumn(); $pages=max(1,(int)ceil($total/$perPage)); $page=min(max(1,$page),$pages); $offset=($page-1)*$perPage;
        $sql="SELECT c.* FROM companies c WHERE $whereSql ORDER BY c.razao_social,c.id LIMIT :limit OFFSET :offset";
        $stmt=$this->pdo->prepare($sql);
        foreach($params as $k=>$v) $stmt->bindValue(':'.$k,$v);
        $stmt->bindValue(':limit',$perPage,PDO::PARAM_INT); $stmt->bindValue(':offset',$offset,PDO::PARAM_INT); $stmt->execute();
        return ['items'=>$stmt->fetchAll(PDO::FETCH_ASSOC),'page'=>$page,'per_page'=>$perPage,'total'=>$total,'total_pages'=>$pages];
    }

    public function get(int $id): ?array {
        $s=$this->pdo->prepare('SELECT * FROM companies WHERE id=? LIMIT 1'); $s->execute([$id]); $r=$s->fetch(PDO::FETCH_ASSOC); return $r ?: null;
    }

    public function options(): array {
        $s=$this->pdo->query("SELECT id, razao_social, fantasia FROM companies WHERE status='active' AND tipo='FOR' ORDER BY fantasia, razao_social");
        return $s->fetchAll(PDO::FETCH_ASSOC);
    }

    public function create(array $d, int $actor): array { return $this->save(0,$d,$actor); }

    public function update(int $id,array $d,int $actor): array {
        if(!$this->get($id)) throw new InvalidArgumentException('Empresa não encontrada.',404);
        return $this->save($id,$d,$actor);
    }

    private function save(int $id,array $d,int $actor): array {
        $old=$id?$this->get($id):null;
        if($id){
            $s=$this->pdo->prepare('UPDATE companies SET razao_social=:razao,fantasia=:fantasia,cnpj=:cnpj,ie=:ie,im=:im,endereco=:endereco,numero=:numero,complemento=:complemento,bairro=:bairro,cidade=:cidade,uf=:uf,cep=:cep,tipo=:tipo,ramo=:ramo,telefone=:telefone,email=:email,status=:status WHERE id=:id');
            $params = [
                'razao'=>$d['razao_social'],
                'fantasia'=>$d['fantasia'],
                'cnpj'=>$d['cnpj'],
                'ie'=>$d['ie'],
                'im'=>$d['im'],
                'endereco'=>$d['endereco'],
                'numero'=>$d['numero'],
                'complemento'=>$d['complemento'],
                'bairro'=>$d['bairro'],
                'cidade'=>$d['cidade'],
                'uf'=>$d['uf'],
                'cep'=>$d['cep'],
                'tipo'=>$d['tipo'],
                'ramo'=>$d['ramo'],
                'telefone'=>$d['telefone'],
                'email'=>$d['email'],
                'status'=>$d['status'],
                'id'=>$id
            ];
            $s->execute($params);
        } else {
            $s=$this->pdo->prepare('INSERT INTO companies (razao_social,fantasia,cnpj,ie,im,endereco,numero,complemento,bairro,cidade,uf,cep,tipo,ramo,telefone,email,status) VALUES (:razao,:fantasia,:cnpj,:ie,:im,:endereco,:numero,:complemento,:bairro,:cidade,:uf,:cep,:tipo,:ramo,:telefone,:email,:status)');
            $params = [
                'razao'=>$d['razao_social'],
                'fantasia'=>$d['fantasia'],
                'cnpj'=>$d['cnpj'],
                'ie'=>$d['ie'],
                'im'=>$d['im'],
                'endereco'=>$d['endereco'],
                'numero'=>$d['numero'],
                'complemento'=>$d['complemento'],
                'bairro'=>$d['bairro'],
                'cidade'=>$d['cidade'],
                'uf'=>$d['uf'],
                'cep'=>$d['cep'],
                'tipo'=>$d['tipo'],
                'ramo'=>$d['ramo'],
                'telefone'=>$d['telefone'],
                'email'=>$d['email'],
                'status'=>$d['status']
            ];
            $s->execute($params); $id=(int)$this->pdo->lastInsertId();
        }
        $new=$this->get($id); $this->audit($actor,$id,$old,$new,$old?'update':'create'); return $new;
    }

    public function inactivate(int $id,int $actor): array {
        $old=$this->get($id); if(!$old) throw new InvalidArgumentException('Empresa não encontrada.',404);
        $s=$this->pdo->prepare("UPDATE companies SET status='inactive' WHERE id=?"); $s->execute([$id]);
        $new=$this->get($id); $this->audit($actor,$id,$old,$new,'delete'); return $new;
    }

    private function audit(int $actor,int $id,?array $old,?array $new,string $action): void {
        $s=$this->pdo->prepare('INSERT INTO audit_logs (user_id,module_code,action,entity_type,entity_id,old_data,new_data,ip_address) VALUES (?,?,?,?,?,?,?,?)');
        $s->execute([$actor,'EMPRESAS',$action,'company',(string)$id,$old?json_encode($old,JSON_UNESCAPED_UNICODE):null,$new?json_encode($new,JSON_UNESCAPED_UNICODE):null,$_SERVER['REMOTE_ADDR']??null]);
    }
}
