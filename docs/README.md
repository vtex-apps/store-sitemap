# Sitemap.xml and Robots.txt

## Sitemap 
We leveraged `vtex.rewriter` to develop the new sitemap, currently we index all store's routes in this app so a simple list will provide all the information needed to create the sitemap. The image bellow shows the final architecture

The main idea is to split the sitemap generator from the service that delivers the sitemap.xml, this will avoid having to wait to list all routes in rewrites, an operation that may take some time depending on the size of the catalog. Therefore, this version of the `vtex.store-sitemap` has one endpoint that upon a request makes asynchronous requests to rewriter, getting all the store's routes and saves the data in VBase

Generate sitemap API: 

- Listens to `sitemap.generate` event
- POST to 
[`https://app.io.vtex.com/vtex.store-sitemap/v2/{{account}}/{{workspace}}/generate-sitemap`](https://app.io.vtex.com/vtex.store-sitemap/v2/powerplanet/newsitemap/generate-sitemap)

With all the data in VBase, when you access the sitemap `vtex.store-sitemap` returns the xml faster. One thing to note, since our architecture is asynchrous, the sitemap delivered may be not complete, so we return a `cache-control` of one day, meaning it updates daily getting all the new routes.

### Sitemap stucture

1. Store with one binding

When you access the path: `/sitemap.xml`  you get an index with an entry that some of the routes the code below shows an example

***/sitemap.xml***

    ```<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    	<sitemap>
    		<loc>
    			https://storetheme.com/sitemap/sitemap-0-7.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    		<sitemap>
    		<loc>
    			https://storetheme.com/sitemap/sitemap-7-11.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    		<sitemap>
    		<loc>
    			https://storetheme.com/sitemap/sitemap-11-17.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    		<sitemap>
    		<loc>
    			https://storetheme.com/sitemap/sitemap-17-25.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    	<sitemap>
    		<loc>
    			https://storetheme.com/sitemap/sitemap-25-28.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    	<sitemap>
    		<loc>
    			https://storetheme.com/sitemap/sitemap-28-202.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    </sitemapindex>```

***/sitemap/sitemap-11-17.xml***

   ``` <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/TR/xhtml11/xhtml11_schema.html">
    	<url>
    		<loc>
    			https://storetheme.com/gorgeous-watch/p
    		</loc>
    		<xhtml:link rel="alternate" hreflang="es-AR" href="https://newsitemap--storecomponents.myvtex.com/gorgeous-watch/p?cultureInfo=es-AR"/>
    		<xhtml:link rel="alternate" hreflang="pt-BR" href="https://newsitemap--storecomponents.myvtex.com/gorgeous-watch/p?cultureInfo=pt-BR"/>
    		<xhtml:link rel="alternate" hreflang="en-US" href="https://newsitemap--storecomponents.myvtex.com/gorgeous-watch/p?cultureInfo=en-US"/>
    		<xhtml:link rel="alternate" hreflang="ja-JP" href="https://newsitemap--storecomponents.myvtex.com/gorgeous-watch/p?cultureInfo=ja-JP"/>
    		<lastmod>2020-04-08</lastmod>
    		<changefreq>daily</changefreq>
    		<priority>0.4</priority>
    	</url>
    	<url>
    		<loc>
    			https://storetheme.com/tank-top/p
    		</loc>
    		<xhtml:link rel="alternate" hreflang="es-AR" href="https://storetheme.com/tank-top/p?cultureInfo=es-AR"/>
    		<xhtml:link rel="alternate" hreflang="pt-BR" href="https://storetheme.com/tank-top/p?cultureInfo=pt-BR"/>
    		<xhtml:link rel="alternate" hreflang="en-US" href="https://storetheme.myvtex.com/tank-top/p?cultureInfo=en-US"/>
    		<xhtml:link rel="alternate" hreflang="ja-JP" href="https://storetheme.myvtex.com/tank-top/p?cultureInfo=ja-JP"/>
    		<lastmod>2020-04-08</lastmod>
    		<changefreq>daily</changefreq>
    		<priority>0.4</priority>
    		</url>
    	<url>
    		<loc>
    			https://storetheme.com/fashion-eyeglasses/p
    		</loc>
    		<xhtml:link rel="alternate" hreflang="es-AR" href="https://storetheme.com/fashion-eyeglasses/p?cultureInfo=es-AR"/>
    		<xhtml:link rel="alternate" hreflang="pt-BR" href="https://storetheme.com/fashion-eyeglasses/p?cultureInfo=pt-BR"/>
    		<xhtml:link rel="alternate" hreflang="en-US" href="https://storetheme.com/fashion-eyeglasses/p?cultureInfo=en-US"/>
    		<xhtml:link rel="alternate" hreflang="ja-JP" href="https://storetheme.com/fashion-eyeglasses/p?cultureInfo=ja-JP"/>
    		<lastmod>2020-04-08</lastmod>
    		<changefreq>daily</changefreq>
    		<priority>0.4</priority>
    	</url>
    	<url>
     ....```

Note that we added localization to the new sitemap, by adding all alternate routes in other supported languages.

2. Store with binding

When you access the path: `/sitemap.xml`  you get an index that has an entry for all the sitemaps by binding, which in turn has all the routes in that bindings, separated by entries.

Example

***/sitemap.xml***

   ``` <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    	<sitemap>
    		<loc>
    			https://powerplanet.com/es/sitemap.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    	<sitemap>
    		<loc>
    			https://powerplanet.com/pt/sitemap.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    	<sitemap>
    		<loc>
    			https://powerplanet.com/fr/sitemap.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    	<sitemap>
    		<loc>
    			https://powerplanet.com/en/sitemap.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    </sitemapindex>```

***/es/sitemap.xml***

    ```<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    	<sitemap>
    		<loc>
    			https://powerplanet.com/es/sitemap/sitemap-0-200.xml
    		</loc>
    		<lastmod>2020-04-08</lastmod>
    	</sitemap>
    ....
```

***/es/sitemap/sitemap-0-200.xml***

    ```<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/TR/xhtml11/xhtml11_schema.html">
    	<url>
    		<loc>
    			https://powerplanet.com/es/vivo-nex-3-8gb-256gb-glowing-night/p
    		</loc>
    		<xhtml:link rel="alternate" hreflang="es-ES" href="https://powerplanet.com/es/vivo-nex-3-8gb-256gb-glowing-night/p?cultureInfo=es-ES"/>
    		<xhtml:link rel="alternate" hreflang="pt-PT" href="https://powerplanet.com/es/vivo-nex-3-8gb-256gb-glowing-night/p?cultureInfo=pt-PT"/>
    		<xhtml:link rel="alternate" hreflang="en-GB" href="https://powerplanet.com/es/vivo-nex-3-8gb-256gb-glowing-night/p?cultureInfo=en-GB"/>
    		<xhtml:link rel="alternate" hreflang="fr-FR" href="https://powerplanet.com/es/vivo-nex-3-8gb-256gb-glowing-night/p?cultureInfo=fr-FR"/>
    		<lastmod>2020-04-08</lastmod>
    		<changefreq>daily</changefreq>
    		<priority>0.4</priority>
    	</url>```
