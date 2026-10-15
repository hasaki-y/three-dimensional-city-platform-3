# PostGIS 本地使用说明

当前电脑已配置完成。数据库内存放教学模拟数据，空间查询实际由 PostGIS 执行。

## 日常启动

在本项目文件夹打开终端，运行：

```powershell
npm run dev
```

启动器会启动本项目数据库，随后启动前后端。默认页面是 <http://localhost:5176>，左侧显示“PostGIS 数据库模式”。健康接口 <http://localhost:3103/api/v1/health> 返回 `mode: postgis`。关闭前后端终端不会删除数据库；下次启动仍保留数据。

如果要切回不依赖数据库的内存演示：`npm run dev:demo`。不要在同一端口上重复启动多个项目进程；以终端实际显示地址为准。

## 数据库连接

- 程序：本机 `C:\Program Files\PostgreSQL\16\bin`，PostgreSQL 16.4 / PostGIS 3.4.0。
- 服务器：`127.0.0.1`。
- 端口：`55432`。
- 数据库：`city_demo`。
- 用户名：`city_app`。
- 密码：在项目根目录 `.env.postgis.local` 的 `PGPASSWORD` 中查看；文档和验收记录不保存密码。
- 数据文件：项目 `.local/postgres`；日志 `.local/postgres.log`。

可以在 pgAdmin 中用以上参数添加连接。现有 5432 实例保持原样；项目实例仅监听本机回环地址。应用账号不是超级用户，拥有本项目数据库以支持教学导入。独立管理员信息只在 `.local/postgis-instance.json` 保存。

## 启停与检查

```powershell
npm run db:status
npm run db:start
npm run db:stop
npm run db:verify
```

`db:stop` 只停止项目实例，建议先停止前后端。重启电脑后运行 `npm run dev` 即可重新启动；此配置不创建开机服务。

`db:verify` 检查真实接口、数据数量、几何、分类统计、缓冲区和最近邻，并更新 `docs/PostGIS本机验收.md`。它不重建或清空表；会更新数据库统计信息以执行查询计划测试。

## 初始化与重新导入

`npm run db:init` 用已安装的 PostgreSQL 程序创建项目实例、数据库和 PostGIS 扩展。已有实例不会重新初始化，不覆盖已有本地密码文件。其他电脑的安装路径不同时，首次初始化前设置 `PG_BIN`。该脚本面向 Windows，不是 PostgreSQL 安装器。

`npm run db:import:local` 会**清空并重导项目数据库的 buildings、pois、roads、water_areas 四张教学表**。数据已经导入，日常使用不需要运行此命令。不要把它指向有真实业务数据的数据库。

## 本地文件与迁移

`.local/` 和 `.env.postgis.local` 已被 Git 忽略，不能提交或发送给他人。不要在数据库运行时移动或删除 `.local/postgres`。换电脑时应重新建立实例并导入，或使用 PostgreSQL 备份/恢复工具；复制源码不会包含数据库和密码。

初始化脚本使用官方 [initdb](https://www.postgresql.org/docs/16/app-initdb.html) 与 [pg_ctl](https://www.postgresql.org/docs/16/app-pg-ctl.html)。Windows 中文路径在部分 PostgreSQL 文本输出中会乱码，因此初始化通过集群唯一标识核对目标实例；不依赖乱码路径来判断数据库身份。

## 验证边界

本机原生数据库与项目接口已验收。Docker Compose、真实地形服务、真实建筑轮廓、十万级数据性能仍未验证。查询计划中的耗时是当前小型教学数据的单次观测。

已验证独立实例停止后重启、`npm run dev` 自动连接，以及浏览器显示 PostGIS 模式并完成地图点选“最近 5 家医院”查询。
