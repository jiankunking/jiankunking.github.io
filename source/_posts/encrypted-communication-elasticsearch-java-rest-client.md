---
layout: w
title: encrypted communication elasticsearch java rest client
date: 2019-08-28 08:34:48
categories:
  - ElasticSearch
tags:
  - ElasticSearch
  - Java
  - Rest
  - Client
  - Encrypted
  - Communication
  - 原创
---

> ElasticSearch 7.3.1 
Java Rest Client HTTPS连接操作

<!-- more -->

ElasticSearch版本7.3.1，elasticsearch.yml配置如下：
```
xpack.security.enabled: true
xpack.security.transport.ssl.enabled: true
xpack.security.transport.ssl.verification_mode: certificate
xpack.security.transport.ssl.key: /home/jiankunking/elasticsearch-7.3.1/config/certs/_.jiankunking.com.key
xpack.security.transport.ssl.certificate: /home/jiankunking/elasticsearch-7.3.1/config/certs/_.jiankunking.com.cer
xpack.security.transport.ssl.certificate_authorities: [ "/home/jiankunking/elasticsearch-7.3.1/config/certs/_.jiankunking.com_ca.crt" ]
xpack.security.http.ssl.enabled: true
xpack.security.http.ssl.key:  /home/jiankunking/elasticsearch-7.3.1/config/certs/_.jiankunking.com.key
xpack.security.http.ssl.certificate: /home/jiankunking/elasticsearch-7.3.1/config/certs/_.jiankunking.com.cer
xpack.security.http.ssl.certificate_authorities: [ "/home/jiankunking/elasticsearch-7.3.1/config/certs/_.jiankunking.com_ca.crt" ]
```
由于ElasticSearch Java client中的[KeyStore Types](https://docs.oracle.com/javase/8/docs/technotes/guides/security/StandardNames.html#KeyStore)只支持以下几种：

|  Type  | Description |
|  ----  | ----  |
| jceks  | The proprietary keystore implementation provided by the SunJCE provider. |
| jks  | The proprietary keystore implementation provided by the SUN provider. |
| dks  | A domain keystore is a collection of keystores presented as a single logical keystore. It is specified by configuration data whose syntax is described in DomainLoadStoreParameter. |
|  pkcs11  | A keystore backed by a PKCS #11 token. |
|  pkcs12  | The transfer syntax for personal identity information as defined in PKCS #12. |

而我这边证书格式为cer，所以通过keytool进行转换：
```
keytool -import -v -trustcacerts -file _.jiankunking.com.cer  -keystore my_keystore.jks -keypass password -storepass password
```
证书转换完成后，操作代码如下：
```
package ssl;

import org.apache.http.HttpHost;
import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.client.CredentialsProvider;
import org.apache.http.impl.client.BasicCredentialsProvider;
import org.apache.http.ssl.SSLContexts;
import org.elasticsearch.client.RequestOptions;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestClientBuilder;
import org.elasticsearch.client.RestHighLevelClient;
import org.elasticsearch.client.indices.CreateIndexRequest;
import org.elasticsearch.client.indices.CreateIndexResponse;
import org.elasticsearch.common.settings.Settings;
import org.elasticsearch.common.xcontent.XContentType;

import javax.net.ssl.SSLContext;
import java.io.File;
import java.io.IOException;
import java.security.KeyManagementException;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.CertificateException;
import java.util.HashMap;
import java.util.Map;

/**
 * @Author: jiankunking
 * @Date: 2019/8/27 15:32
 * @Description:
 */
public class es {
    public static void main(String[] args) throws KeyStoreException, IOException, NoSuchAlgorithmException, KeyManagementException, CertificateException {
        
        CredentialsProvider credentialsProvider = new BasicCredentialsProvider();
        credentialsProvider.setCredentials(AuthScope.ANY, new UsernamePasswordCredentials("elastic", "jiankunking"));

        SSLContext sslContext = SSLContexts.custom()
                .loadTrustMaterial(new File("I:\\certs\\my_keystore.jks"))
                .build();

        String host = "es.jiankunking.com";
        int port = 9200;
        String scheme = "https";
        String indexName = "twitter2";

        RestClientBuilder restClientBuilder = RestClient.builder(new HttpHost(host, port, scheme)).setHttpClientConfigCallback(httpClientBuilder -> httpClientBuilder
                .setDefaultCredentialsProvider(credentialsProvider)
                .setSSLContext(sslContext)
        );

		// 到这里RestHighLevelClient已经初始化完成，下面的创建索引是测试
        RestHighLevelClient restHighLevelClient = new RestHighLevelClient(restClientBuilder);

        // 创建索引请求
        CreateIndexRequest request = new CreateIndexRequest(indexName);
        request.settings(Settings.builder()
                .put("index.number_of_shards", 3)
                .put("index.number_of_replicas", 2)
        );
        request.mapping(
                "{\n" +
                        "  \"properties\": {\n" +
                        "    \"message\": {\n" +
                        "      \"type\": \"text\"\n" +
                        "    }\n" +
                        "  }\n" +
                        "}",
                XContentType.JSON);
        Map<String, Object> message = new HashMap<>();
        message.put("type", "text");
        Map<String, Object> properties = new HashMap<>();
        properties.put("message", message);
        Map<String, Object> mapping = new HashMap<>();
        mapping.put("properties", properties);
        request.mapping(mapping);
        CreateIndexResponse createIndexResponse;
        try {
            createIndexResponse = restHighLevelClient.indices().create(request, RequestOptions.DEFAULT);
            System.out.println(createIndexResponse);
        } catch (IOException e) {
            e.printStackTrace();
        }

    }
}
```