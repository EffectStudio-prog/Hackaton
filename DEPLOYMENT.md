# Deployment Guide

If your git hosting webpage only shows the repository README, that is the repository browser, not the deployed app.

Use the generated Pages URL instead of the repository URL.

## What This Repo Now Supports

- Static frontend deployment for GitHub Pages
- Static frontend deployment for GitLab Pages
- Configurable backend API URL through `VITE_API_BASE_URL`
- Relative asset paths so the frontend works from a repo subpath

## Important Limitation

The `frontend` can be deployed to Pages, but the FastAPI `backend` cannot run on a static git-hosted Pages site.

You need:

1. A public backend deployment
2. `VITE_API_BASE_URL` set to that backend URL during the frontend build

Example:

```env
VITE_API_BASE_URL=https://your-backend-host.example.com
```

## GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`.

Steps:

1. Push to `main` or `master`
2. Open repository `Settings -> Pages`
3. Set the source to `GitHub Actions`
4. Add repository variable or secret `VITE_API_BASE_URL`
5. Open the generated Pages URL

## GitLab Pages

This repo includes `.gitlab-ci.yml`.

Steps:

1. Add CI/CD variable `VITE_API_BASE_URL`
2. Push to the default branch
3. Open the generated GitLab Pages URL
