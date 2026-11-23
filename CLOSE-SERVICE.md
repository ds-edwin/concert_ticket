# Service closure

GitHub Pages now permits existing ticket viewing only. Bank payments are not verified by this system.

Required server update: replace the current Apps Script installation with apps-script/INSTALL.gs. Do not keep duplicate Code.gs or HTTP.gs functions. Preserve script properties and spreadsheet data. Do not run setup again. Choose Deploy > Manage deployments > Edit existing web app > New version > Deploy, retaining the same /exec URL.

Until that deployment is updated, cached pages and direct API clients can still issue tickets. After deployment, SERVICE_CLOSED_ defaults to true: fresh issuance and deposits are rejected, existing token retries and restore remain supported. Paid customers without an issued ticket must contact the organizer.
