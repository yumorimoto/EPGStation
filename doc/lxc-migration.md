# 既存の Linux 環境から Debian LXC 環境への移行について

これまで `pm2` や Docker を用いて構築していた EPGStation を、新たに作成した Debian 13 (Trixie) LXC コンテナと systemd をベースにした環境へ移行する際の手順です。

## 1. 移行元（旧環境）でのデータバックアップ

移行元の EPGStation を停止し、必要なデータ（設定、録画ファイル、データベースなど）を安全にバックアップします。

### 1.1 サービスの停止

旧環境で動作している EPGStation と録画バックエンド（Mirakurun等）を停止します。

- **pm2 環境の場合:**
  ```bash
  $ pm2 stop epgstation
  ```
- **Docker 環境の場合:**
  ```bash
  $ docker-compose stop
  ```

### 1.2 データベースのバックアップ

データベース（予約情報、録画履歴、ルールなど）をエクスポートします。

```bash
$ npm run backup backup.json
```
※ もし SQLite3 を使用している場合、データベースファイル（通常は `data/database.sqlite3` 等）を直接コピーする方法でも移行可能です。

### 1.3 必要なディレクトリとファイルのコピー

以下のディレクトリおよびファイルは EPGStation にとって重要です。LXC コンテナ側へ転送するために、安全な場所（またはアーカイブ）にコピーします。

- `config/config.yml` （新しい LXC 環境でもチューナーやデータベース設定を引き継ぐ際に参考にします）
- `config/operatorLogConfig.yml` などのログ設定ファイル (カスタマイズしている場合)
- `recorded/` ディレクトリ （これまでの録画ファイル）
- `thumbnail/` ディレクトリ （録画のサムネイル画像）
- `data/` ディレクトリ （SQLite を直接引き継ぐ場合のみ）
- 先ほど出力した `backup.json`

## 2. 新しい LXC コンテナ（移行先）のセットアップ

[Debian LXC / Ansible 用セットアップマニュアル](linux-setup.md) に従って、新しい LXC コンテナに対して Ansible playbook を実行し、クリーンな EPGStation と mirakc の環境を自動構築します。

Playbook の実行が完了すると、EPGStation と mirakc が `systemd` サービスとして起動した状態になります。

## 3. LXC 環境へのデータリストア

構築したばかりの新しい環境を一旦停止し、データを復元します。

### 3.1 サービスの停止

Ansible により自動起動しているサービスを停止します。

```bash
$ sudo systemctl stop epgstation
```

### 3.2 録画ファイルとサムネイルの配置

移行元の環境からコピーした `recorded/` と `thumbnail/` ディレクトリの中身を、LXC コンテナ内の `/opt/epgstation/recorded/` および `/opt/epgstation/thumbnail/` に上書きコピーします。（`rsync` などを利用すると便利です）

```bash
$ rsync -avh /path/to/old/recorded/ root@192.168.x.x:/opt/epgstation/recorded/
$ rsync -avh /path/to/old/thumbnail/ root@192.168.x.x:/opt/epgstation/thumbnail/
```

ファイルのパーミッションや所有者が LXC 上の EPGStation の実行ユーザー（本 Ansible Playbook のデフォルトでは root）と一致していることを確認してください。

### 3.3 設定ファイル (`config.yml`) のマージ

新しい環境には、mirakc 用の `config.yml` が生成されています。
バックアップした旧環境の `config.yml` と見比べ、必要なエンコード設定や保存ディレクトリ設定などを新しい `config.yml` に反映させます。
※ `mirakurunPath` の設定は新しい mirakc 用のまま残してください。

### 3.4 データベースの復元

SQLite のファイル (`data/database.sqlite3`) を直接コピーした場合は、指定のディレクトリへ上書き配置します。

バックアップコマンド (`backup.json`) で移行する場合は、復元コマンドを実行します。

```bash
$ cd /opt/epgstation
$ npm run restore /path/to/backup.json
```

## 4. サービスの再開と動作確認

データと設定の移行が完了したら、サービスを起動します。

```bash
$ sudo systemctl start epgstation
```

ブラウザから EPGStation の WebUI にアクセスし、以下の点を確認します：
- 番組表が表示され、チューナー(mirakc)から情報が取れていること
- 録画済みの番組一覧が表示され、これまでの録画が再生できること
- 予約ルールや履歴が引き継がれていること
