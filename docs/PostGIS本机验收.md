# PostGIS 本机验收记录

验收时间：2026-10-10T10:45:42.585Z

- 连接：127.0.0.1/32:55432 / city_demo
- 应用账户：city_app（非超级用户）
- PostgreSQL 16.4, compiled by Visual C++ build 1940, 64-bit
- POSTGIS="3.4.0 3.4.0" [EXTENSION] PGSQL="160" GEOS="3.12.0-CAPI-1.18.0" PROJ="8.2.1 NETWORK_ENABLED=OFF URL_ENDPOINT= USER_WRITABLE_DIRECTORY=C:\Users\10149\AppData\Local/proj" LIBXML="2.9.14" LIBJSON="0.12" LIBPROTOBUF="1.2.1" WAGYU="0.5.0 (Internal)"

## 数据与接口

- buildings: 3489
- pois: 670
- roads: 10
- water_areas: 3
- 通过：健康检查：mode=postgis，使用真实数据库仓库
- 通过：四表数量与源 GeoJSON 一致；全部几何有效且 SRID=4326；应用账户不是超级用户
- 通过：BBOX 返回 645 栋；建筑筛选、详情、道路、水系、完整类型统计通过
- 通过：真实空间查询：300m 范围 227 栋；最近医院 5 个；1km 范围银行 23 个；缺失类别返回空结果
- 通过：多类应急：800m 影响 1183 栋、范围设施 37 个；分类计数一致；非法请求返回 400

## 索引

```text
CREATE INDEX buildings_geog_gix ON public.buildings USING gist (((geom)::geography))
CREATE INDEX buildings_geom_gix ON public.buildings USING gist (geom)
CREATE UNIQUE INDEX buildings_pkey ON public.buildings USING btree (id)
CREATE INDEX buildings_type_idx ON public.buildings USING btree (type)
CREATE INDEX pois_category_idx ON public.pois USING btree (category)
CREATE INDEX pois_geog_gix ON public.pois USING gist (((geom)::geography))
CREATE INDEX pois_geom_gix ON public.pois USING gist (geom)
CREATE UNIQUE INDEX pois_pkey ON public.pois USING btree (id)
CREATE INDEX pois_type_idx ON public.pois USING btree (type)
CREATE INDEX roads_geom_gix ON public.roads USING gist (geom)
CREATE UNIQUE INDEX roads_pkey ON public.roads USING btree (id)
CREATE INDEX water_areas_geom_gix ON public.water_areas USING gist (geom)
CREATE UNIQUE INDEX water_areas_pkey ON public.water_areas USING btree (id)
```

## EXPLAIN ANALYZE

对教学小数据执行 ANALYZE 后，保持优化器默认设置。以下为单次本机观测，不能推断大规模性能或固定加速比例。

```text
Query 1
Bitmap Heap Scan on buildings  (cost=5.36..1553.93 rows=118 width=5) (actual time=0.084..0.399 rows=645 loops=1)
  Recheck Cond: (geom && '0103000020E610000001000000050000009A99999999015E406666666666463E409A99999999015E40295C8FC2F5483E400AD7A3703D025E40295C8FC2F5483E400AD7A3703D025E406666666666463E409A99999999015E406666666666463E40'::geometry)
  Filter: st_intersects(geom, '0103000020E610000001000000050000009A99999999015E406666666666463E409A99999999015E40295C8FC2F5483E400AD7A3703D025E40295C8FC2F5483E400AD7A3703D025E406666666666463E409A99999999015E406666666666463E40'::geometry)
  Rows Removed by Filter: 3
  Heap Blocks: exact=70
  Buffers: shared hit=78
  ->  Bitmap Index Scan on buildings_geom_gix  (cost=0.00..5.33 rows=118 width=0) (actual time=0.071..0.071 rows=648 loops=1)
        Index Cond: ((geom && '0103000020E610000001000000050000009A99999999015E406666666666463E409A99999999015E40295C8FC2F5483E400AD7A3703D025E40295C8FC2F5483E400AD7A3703D025E406666666666463E409A99999999015E406666666666463E40'::geometry) AND (geom && '0103000020E610000001000000050000009A99999999015E406666666666463E409A99999999015E40295C8FC2F5483E400AD7A3703D025E40295C8FC2F5483E400AD7A3703D025E406666666666463E409A99999999015E406666666666463E40'::geometry))
        Buffers: shared hit=8
Planning:
  Buffers: shared hit=28
Planning Time: 0.485 ms
Execution Time: 0.863 ms

Query 2
Bitmap Heap Scan on buildings  (cost=14.79..4288.99 rows=1 width=5) (actual time=0.085..0.518 rows=227 loops=1)
  Filter: st_dwithin((geom)::geography, '0101000020E61000006F1283C0CA015E40F4FDD478E9463E40'::geography, '300'::double precision, true)
  Rows Removed by Filter: 117
  Heap Blocks: exact=70
  Buffers: shared hit=79
  ->  Bitmap Index Scan on buildings_geog_gix  (cost=0.00..14.79 rows=336 width=0) (actual time=0.070..0.070 rows=344 loops=1)
        Index Cond: ((geom)::geography && _st_expand('0101000020E61000006F1283C0CA015E40F4FDD478E9463E40'::geography, '300'::double precision))
        Buffers: shared hit=9
Planning:
  Buffers: shared hit=31
Planning Time: 0.499 ms
Execution Time: 0.935 ms

Query 3
Limit  (cost=0.14..8.19 rows=5 width=12) (actual time=0.069..0.189 rows=5 loops=1)
  Buffers: shared hit=27
  ->  Index Scan using pois_geog_gix on pois  (cost=0.14..96.69 rows=60 width=12) (actual time=0.069..0.188 rows=5 loops=1)
        Order By: ((geom)::geography <-> '0101000020E61000006F1283C0CA015E40F4FDD478E9463E40'::geography)
        Filter: (category = 'hospital'::text)
        Rows Removed by Filter: 19
        Buffers: shared hit=27
Planning:
  Buffers: shared hit=3
Planning Time: 0.051 ms
Execution Time: 0.245 ms
```

本次验证原生 PostgreSQL 实例；没有验证 Docker Compose。真实地形、真实城市数据和十万级渲染均不在本记录范围。
