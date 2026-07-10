# Kubernetes Deployment

This is a layered Kustomize deployment for the API only. The Vercel frontend
must receive the public HTTPS API URL as `VITE_API_URL` at build time.

## Layers

- `base/`: namespace, non-secret runtime configuration, API Deployment, and
  ClusterIP Service.
- `overlays/production/`: production image reference, generated Secret, and an
  NGINX Ingress configured for long-lived SSE and WebSocket requests.

## Required Infrastructure

1. A Kubernetes cluster with a reachable API endpoint and an NGINX ingress
   controller.
2. A public DNS name routed to that ingress. Replace every `api.example.com` in
   `overlays/production/ingress.yaml` before deploying.
3. A TLS secret named `persona-blindbox-api-tls`, or cert-manager configured to
   create it.
4. A registry that the cluster can pull from. Replace the image name/tag in
   `overlays/production/kustomization.yaml` with the pushed server image.

## Deploy

```sh
cp deploy/k8s/overlays/production/secrets.env.example \
  deploy/k8s/overlays/production/secrets.env
kubectl apply -k deploy/k8s/overlays/production
kubectl -n persona-blindbox rollout status deployment/persona-blindbox-server
curl -fsS https://api.example.com/health
```

Build and publish the API image from the repository root before applying the
overlay. Do not place API keys in a manifest or pass them as a frontend build
variable.
