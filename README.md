# 三维城市空间分析平台 3.0（第一轮：产品流程）

用于浏览三维城市、查询城市设施并进行应急空间分析的教学项目。技术栈为 Vue 3、TypeScript、Cesium、Pinia、Axios、ECharts、Express，可切换 Demo / PostGIS 数据仓库。

**现有 3489 栋建筑和 670 个 POI 是固定种子生成的模拟数据**，不是真实杭州城市资料。建筑几何是中心点，画面中的三维方盒也不是实测模型。底图是在线地理背景，模拟建筑与底图上的实际建筑、街道不保证重合。分析结果不可用于实际应急决策。

## 3.0 本轮已实现

- 默认深色底图和建筑；辅助设施、道路、水系默认关闭，关闭的辅助图层不请求数据。
- 地图右上角切换深色、浅色、影像，保持业务数据和相机位置；底图加载失败显示重试提示。
- 附近设施：设置类别，选择最近 1–20 个或 1–2000 米范围，点选位置，再主动提交查询。结果为独立设施图层，可点选看属性。
- 范围内建筑查询：自定义半径；返回中心点位于范围内的建筑、计数、列表及高亮。底层 buffer API 保留，页面使用业务名称。
- 应急事件：火灾 / 爆炸 / 化学泄漏预设、自定义半径、300/500/1000/2000 米快捷按钮、多类资源勾选。预设只用于教学，不代表应急规范。
- 应急结果含影响范围、建筑数量、类型统计、设施分类计数、每类最近 5 个资源；地图高亮、图表筛选、列表定位和两点框选继续可用。
- 原始 POI 图层与查询结果图层独立。查询期间隐藏无关原始 POI，退出恢复用户图层设置。点数至少 30 且相机高度超过 1800m 才聚合，近处自动拆分。
- 修改查询参数、重选位置、切换任务或退出时，清除旧结果并通过 AbortController 和请求序号失效旧响应。
- 没有可用真实地形服务时禁用高程剖面；已移除模拟高程回退。真实地形代码路径尚未联网采样验证。
- 移除首屏装饰粒子。窄窗口下结果面板可收起，查询完成自动展开；专题结果优先显示。

当前仍按相机 BBOX 加载建筑，移动结束后防抖 250ms 并取消旧请求。**缓存、分级建筑加载、道路重新生成、Entity/Primitive 实验尚未在本轮完成。**

实施记录：[3.0 分轮进度](docs/3.0实施进度.md)。历史基线：[2.0 实施记录](docs/路线图实施进度.md)、[原始源码基线](docs/00-现状基线.md)。

## 本地启动（不需要数据库）

要求 Node.js 20.12+。在项目根目录执行：

```powershell
npm ci
npm ci --prefix server
npm ci --prefix web
npm run dev
```

未配置本地数据库时默认前端 <http://localhost:5173>，后端 <http://localhost:3001/api/v1/health>。当前电脑已配置项目专用 PostGIS，`npm run dev` 自动启动数据库并加载本地连接配置：前端 <http://localhost:5176>，后端 <http://localhost:3103/api/v1/health>。强制使用 GeoJSON 时运行 `npm run dev:demo`。端口被占用时 Vite 会显示实际使用的端口。

## 设施数据约定

接口统一用英文 `category`；`type` 保留原始中文显示名。前端颜色和分类判断使用 category。当前提供的主要选择项为 `hospital`、`fire_station`、`bank`、`school`、`mall`、`shelter`，后端也映射原数据中的酒店、公交站、药店等类别。

**原始数据未收录消防站、避难设施**。查询会返回空列表；应急摘要显示“当前数据未收录”，不制造假资源。原始 670 条 POI 保持不变，类别在读取/导入时标准化。

- 设施范围结果最多返回 100 个，`count` 为完整计数，`truncated` 表示截断。
- 应急建筑最多返回 500 栋，地图高亮/框选基于这批结果，建筑列表显示筛选后前 80 栋；`affectedTotal` 与未框选的类型统计是完整范围计数。
- 应急范围设施最多返回 50 个；每个选中类别另查最近 5 个，可位于影响范围外。地图显示两者去重后的设施。
- 距离是空间直线距离，不是驾车距离、救援时间或路径可达性。

## 接口

响应统一为 `{data: ...}`，错误为 `{error: {code, message, requestId}}`。经纬度为 EPSG:4326，BBOX 为 `west,south,east,north`，半径和距离均为米。

- `GET /api/v1/health`：数据模式及连接检查。
- `GET /api/v1/buildings?bbox=&type=&minFloors=&limit=&offset=`：视野、类型、楼层与分页查询，最多 5000 条。
- `GET /api/v1/buildings/:id`：建筑详情。
- `GET /api/v1/pois?bbox=&category=&limit=&offset=`：原始设施分页。
- `GET /api/v1/roads?bbox=`、`GET /api/v1/water-areas?bbox=`：辅助图层。
- `GET /api/v1/aggregate?by=type`：全城市建筑统计。
- `POST /api/v1/analysis/facilities`：附近设施业务查询，示例如下。
- `POST /api/v1/analysis/emergency`：应急工作流，示例如下。
- `POST /api/v1/analysis/buffer`：保留底层建筑范围能力，请求 `{lon,lat,radiusMeters}`。
- `GET /api/v1/analysis/nearest?lon=&lat=&category=&limit=`：保留底层最近设施能力。

```json
{"lon":120.028,"lat":30.277,"category":"hospital","mode":"nearest","limit":5}
```

```json
{"lon":120.028,"lat":30.277,"category":"bank","mode":"radius","radiusMeters":1000}
```

```json
{"lon":120.028,"lat":30.277,"eventType":"fire","radiusMeters":500,"categories":["hospital","fire_station"]}
```

为兼容 2.0，应急旧请求中的 `eventType: "事故"` 映射为 fire，`facilityType` 映射为单类别；新响应统一使用分类摘要 `facilitySummary.byCategory`。旧 `/api/*` 只在 demo 模式保留。

Demo 使用 Turf 距离/缓冲；PostGIS 使用 geography 的 `ST_DWithin`、`ST_Buffer`、GiST KNN `<->`，返回距离用 `ST_Distance`。球面/椭球距离模型不同，边界结果可能略有差别。建筑判断均基于中心点，不代表真实建筑轮廓相交。

## PostGIS 环境（本机已配置并验收）

2026-10-10 通过完整安装路径发现本机已有 PostgreSQL 16.4 和 PostGIS 3.4.0；此前仅检查 PATH，漏掉了已有安装。已复用这些程序，在项目 `.local/postgres` 建立独立实例，监听 `127.0.0.1:55432`。原有 5432 数据库服务未改动。本次采用原生实例，Docker Compose 未运行验收。

数据库名 `city_demo`，应用账号 `city_app`（非超级用户），采用随机密码和 SCRAM 认证。连接信息保存在 `.env.postgis.local`，实例管理信息保存在 `.local/postgis-instance.json`，二者及数据库文件均由 Git 忽略。

已导入 3489 栋建筑、670 个 POI、10 条道路、3 个水系；真实验证 BBOX、建筑筛选/详情、聚合、buffer、nearest、设施查询、多类应急分析和非法参数。已保存三类查询的真实 EXPLAIN ANALYZE，使用了 GiST 索引。测试还发现并修复了仅用包围盒预筛选产生的 3 个边界外点，现增加 `ST_Intersects` 精确判断。

详细结果：[PostGIS 本机验收记录](docs/PostGIS本机验收.md)。启动、停止与配置说明：[本地数据库使用说明](docs/PostGIS本地使用说明.md)。

```powershell
npm run dev          # 自动启动本项目数据库及前后端
npm run db:status    # 数据库状态
npm run db:stop      # 停止本项目数据库；建议先停止前后端
npm run db:verify    # 重新执行真实数据库验收并更新报告
```

以下 Compose 方案保留给安装了 Docker 的其他环境，不用于本机当前实例：

在已安装 Docker 的环境：

```powershell
Copy-Item .env.example .env
# 修改本地演示数据库密码
docker compose up -d --build
docker compose run --rm server npm run db:import
```

导入脚本会建表、增加 POI category 字段，**清空并重导 buildings、pois、roads、water_areas 四张表**。只用于本项目的教学数据库。由 2.0 升级的模拟数据库也需重新导入，原始中文类别会转换为统一编码。已有真实业务数据库应另做保留数据的迁移，不运行此重置脚本。

健康接口应返回 `mode: postgis`，然后再验证业务接口与 `server/sql/explain.sql`。Compose 端口只绑定本机。若使用已有 PostgreSQL/PostGIS，设置 DATABASE_URL 或 PGHOST/PGUSER/PGPASSWORD/PGDATABASE，再执行导入和启动。连接密码不提交 Git。

## 底图与地形配置

复制 `web/.env.example` 为本地 `web/.env`，可设置三个 `VITE_BASEMAP_*_URL` 和 `VITE_BASEMAP_CREDIT`。URL 需为 Web Mercator XYZ 瓦片；默认灰色服务最大级别 16，影像 19。自定义更高分辨率服务时同步调整 `useBaseMap.ts` 的 maximumLevel。Compose 中在根目录 .env 填相同变量。

默认使用 Esri Dark Gray、Light Gray、World Imagery 在线服务，保留来源署名；依赖网络和服务可用性，正式部署需核对供应商授权/服务条款，也可替换为已有授权的服务。本次放弃 CARTO 默认地址，因为实测返回了需要 API Key 的水印瓦片。不能仅凭 HTTP 成功判断底图可用。

实现参考 [Cesium UrlTemplateImageryProvider](https://cesium.com/learn/cesiumjs/ref-doc/UrlTemplateImageryProvider.html)、[Esri 灰色底图说明及署名](https://doc.arcgis.com/en/data-appliance/2022/maps/world-dark-gray-base.htm)。

真实剖面需设置有效 `VITE_CESIUM_ION_TOKEN`。连接成功才启用入口，使用 `sampleTerrainMostDetailed`，最大 200 个采样点。采样 provider 目前独立于城市椭球场景；真实地形贴地和建筑高程适配仍属于后续工作。

## 验证

```powershell
npm test --prefix server
& web/node_modules/.bin/vue-tsc.cmd --noEmit --project web/tsconfig.json
npm run build --prefix web
```

本轮测试覆盖 BBOX、非法参数、类别筛选、最近结果排序、半径边界、多类应急统计、缺失设施与旧接口兼容。浏览器验证记录见 3.0 实施进度。当前无十万级数据、数据库性能或 Entity/Primitive 对照实测，不作对应性能承诺。
