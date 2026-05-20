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
