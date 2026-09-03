# Release and update flow

mdbe uses the Chrome Web Store as its user-facing automatic update channel and GitHub Releases as the downloadable archive and changelog channel. A GitHub ZIP installed as an unpacked extension does not automatically update.

## One-time Chrome Web Store setup

The Chrome Web Store API v2 can update an existing item, but it cannot create the item or complete its listing metadata. Complete these steps once:

1. Register the publisher account and enable two-step verification.
2. Manually create the mdbe item in the Chrome Web Store Developer Dashboard.
3. Upload and publish the first build manually with **Unlisted** visibility.
4. Enable the Chrome Web Store API in a Google Cloud project.
5. Create a service account and add its email under the Developer Dashboard's **Account** section.
6. Configure GitHub Actions OIDC through Google Cloud Workload Identity Federation. Restrict the provider to `ChangJunPark/mdbe` and release tag refs. Grant that GitHub principal `roles/iam.workloadIdentityUser` and `roles/iam.serviceAccountTokenCreator` on the service account so the workflow can mint a short-lived scoped token.
7. Add these GitHub repository variables:

| Variable                         | Value                                           |
| -------------------------------- | ----------------------------------------------- |
| `CWS_PUBLISHER_ID`               | Publisher ID from the Developer Dashboard       |
| `CWS_EXTENSION_ID`               | 32-character ID of the manually created item    |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity provider resource name   |
| `CWS_SERVICE_ACCOUNT_EMAIL`      | Service account linked to the publisher         |
| `CWS_PUBLISH_TYPE`               | Optional: `STAGED_PUBLISH` or `DEFAULT_PUBLISH` |

No long-lived Google service-account key is stored in GitHub. The release workflow requests a short-lived access token scoped only to `https://www.googleapis.com/auth/chromewebstore`.

Start with `STAGED_PUBLISH`, which is also the script default. The update is reviewed and then waits for an explicit publish action. Change the variable to `DEFAULT_PUBLISH` only after the end-to-end update test is complete; approved updates will then publish automatically.

Changing an item's visibility in the Developer Dashboard requires one manual publish before the API can publish with that new visibility.

Official references:

- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/service-accounts
- https://developer.chrome.com/docs/webstore/using-api
- https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish

## Create a release

1. Update `package.json` to the target version.
2. Run the complete local validation.
3. Commit and merge the release changes into `main`.
4. Create and push a matching tag such as `v0.2.0`.

The `Release` GitHub Actions workflow then:

1. Checks that the tag and package versions match.
2. Type-checks, tests, and builds the extension.
3. Verifies the ZIP and publishes it to GitHub Releases.
4. If all Web Store variables are configured, obtains a short-lived Google access token, uploads the ZIP with Chrome Web Store API v2, and submits it using the configured publish type.

The API client fails closed on malformed identifiers, upload failures, warnings, and timeouts. It polls `fetchStatus` when package processing is asynchronous.

## End-to-end automatic update test

Do not claim store updates are verified from mocked runtime events alone. Before enabling `DEFAULT_PUBLISH`:

1. Install the initial Unlisted store build in a clean Chrome profile.
2. Open a writable test Markdown file and leave a second test with unsaved changes.
3. Submit a higher patch version through the release workflow.
4. Confirm Chrome downloads the approved update without reinstalling the extension.
5. Confirm the clean editor offers **Restart to update**.
6. Confirm the dirty editor disables restart until the file is saved.
7. Restart, verify the new version, reopen the test folder if Chrome asks for permission again, and verify no Markdown bytes were lost.
