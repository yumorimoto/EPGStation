# Debian LXC / Ansible 用 セットアップマニュアル

本マニュアルでは、Debian 13 (Trixie) LXC 環境における Ansible を用いたセットアップ手順を解説します。

## セットアップ

リポジトリに含まれる Ansible Playbook を使用することで、依存パッケージのインストールから EPGStation と mirakc の起動までを自動で行うことができます。

1. **Ansible の準備**
   実行元 (ホストOSまたは他の管理マシン) に Ansible がインストールされている必要があります。
   ```bash
   $ sudo apt install ansible
   ```

2. **インベントリの作成**
   LXC コンテナの IP アドレスや SSH 接続情報を記載した `inventory.ini` を作成します。
   ```ini
   [epgstation]
   192.168.1.100 ansible_user=root
   ```

3. **Playbook の実行**
   ```bash
   $ ansible-playbook -i inventory.ini ansible/setup-lxc.yml
   ```
   この Playbook は以下の処理を行います。
   - 必要なシステムパッケージ (Node.js, FFmpeg, Python3, build-essential, sqlite3 など) のインストール
   - SQLite3 regexp 拡張のコンパイル
   - mirakc のインストールおよび systemd への登録・起動
   - EPGStation のビルド、依存モジュール (`npm ci`) のインストール
   - config.yml の生成 (mirakc 連携および sqlite3 regexp の設定)
   - EPGStation を systemd (epgstation.service) として登録・起動

## EPGStation の起動 / 終了 (systemd)

Ansible 実行後は systemd によって管理されるため、OS 起動時に自動で EPGStation と mirakc が起動します。

- サービスのステータス確認
  ```bash
  $ systemctl status epgstation
  ```

- サービスの再起動
  ```bash
  $ systemctl restart epgstation
  ```

- サービスの停止
  ```bash
  $ systemctl stop epgstation
  ```

## pm2 から systemd への移行方法

以前のバージョンで `pm2` を使用して EPGStation を自動起動していた場合、以下の手順で `pm2` の管理から `systemd` へ移行できます。

1. **pm2 で動作している EPGStation を停止・削除する**
   現在 pm2 で実行されているプロセスを停止し、リストから削除した上で状態を保存します。これにより OS 再起動時に pm2 経由で起動されなくなります。
   ```bash
   $ pm2 stop epgstation
   $ pm2 delete epgstation
   $ pm2 save
   ```

2. **pm2 の自動起動設定を無効化する (オプション)**
   もし pm2 で他に動かしているアプリケーションがなく、pm2 自体が不要になる場合は、自動起動設定を解除してアンインストールします。
   ```bash
   $ pm2 unstartup
   $ npm uninstall -g pm2
   ```

3. **systemd での起動**
   その後、上記の Ansible Playbook を実行すると自動で `systemd` のサービスとして登録・起動されます。
   (手動でサービスファイルを作成した場合は、`sudo systemctl daemon-reload` の後、`sudo systemctl enable --now epgstation` を実行してください)
