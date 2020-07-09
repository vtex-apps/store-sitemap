# Sitemap.xml and Robots.txt

Provides `sitemap.xml` and `robots.txt` from every VTEX Store.

> Note: This is only a proxy for the VTEX catalog sitemap, so you need first to configure your sitemap in the VTEX admin and then install this app 
# Store Sitemap

Our Store Sitemap app, `vtex.store-sitemap`, is responsible for automatically generating a `sitemap.xml` file of your VTEX IO Store. 
One of our app’s important SEO features for cross-border stores is handling route internationalization. This guarantees that each route has its alternate link for the supported locale binding.

For more information about generating a sitemap, check the following sections.

:warning: *This app is available to stores using `vtex.edition-store@3.x` [Edition App](https://vtex.io/docs/concepts/edition-app/). To check which Edition App is installed on your account, run `vtex edition get`. If it's a different Edition, please [open a ticket](https://help-tickets.vtex.com/smartlink/sso/login/zendesk) to VTEX Support asking for the installation of the `vtex.edition-store@3.x` Edition App.*

## Configuration

1. Using your terminal and the [VTEX IO Toolbelt](https://vtex.io/docs/recipes/development/vtex-io-cli-installation-and-command-reference/), log into your account.
2. Run `vtex use {workspaceName} --production` to use a production workspace or [create a production workspace](https://vtex.io/docs/recipes/development/creating-a-production-workspace/)  from scratch.

:warning: *Remember to replace the values between the curly brackets according to your scenario.*
	
3. Run `vtex local token` to generate a unique and temporary API token. Save the generated token to use later.
4. Open an API testing tool such as [Postman](https://www.postman.com/) and [create a basic request](https://learning.postman.com/docs/postman/sending-api-requests/requests/#creating-requests).
5. In the "Authorization" tab, select "Bearer Token" as type and paste the token generated in the previous step into the "Token" field.
6. Use the `GET` method to send a request to the following URL: `https://app.io.vtex.com/vtex.routes-bootstrap/v0/{account}/{workspace}/bootstrap`. In the response body, you'll see a `json` containing information about the number of department, category and brand routes that were saved in the database.
7. Create a new request and use the `GET` method to send a request to the following URL: `https://app.io.vtex.com/vtex.store-sitemap/v2/{account}/{workspace}/generate-sitemap`. The expected response body is an `OK` in text format. This means your sitemap will be available in some minutes, after being processed and saved on our database.

:blue_book: *Keep in mind that the time taken to generate a sitemap is proportional to the number of products. For example, the average time to generate a sitemap for a store with 60k products is 30 minutes. For 5k products, the duration should be about 5 minutes.*

8. Check the sitemap generated for the current workspace you are working on by accessing `https://{workspace}--{account}.myvtex.com/sitemap.xml` on your browser. 

:warning: *If your store is a cross-border one, when you access `https://{workspace}--{account}.myvtex.com/sitemap.xml`, you’ll first see an index containing the paths for each sitemap of your local stores.*

Notice that different `.xml` files are generated according to their entity type (product, category, subcategory, user routes, brand and department) and that each `.xml` file supports a maximum of 5k routes. 

9. Once you're happy with the results, run `vtex promote` to promote your workspace and to have your sitemap in your master workspace.

Once you promoted your workspace, no further actions are needed on your part: you are ready to check out your store's sitemap by accessing `https://{account}.myvtex.com/sitemap.xml` on your browser. 

## Modus Operandis

Once the app is deployed and installed in your account, your store will benefit from having a sitemap, which can lead to increased visibility of your site in search tools, such as Google.
