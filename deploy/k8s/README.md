# P05 Kubernetes manifests

calendar api / web / worker。DB URL や internal token は overlay から渡す前提で、単体 apply ではなく `pf-cloud-k8s` から参照する。

```powershell
cd ..\..\pf-cloud-k8s
# 後続で追加する scheduling-talent overlay から起動
```

Compose 単体デモは従来どおり `deploy/compose.yaml`。