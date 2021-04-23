---
title: Kubernetes Service
date: 2021-03-27 13:38:26
categories:
  - Kubernetes
tags:
  - Kubernetes
  - Service
  - DNS
  - Discovery
abbrlink: 40485
---

Kubernetes Service、DNS与服务发现

TODO 未写完

<!-- more -->

大体的流程大家基本都清楚：
```
Service -> ClusterIP -> Pod N
```

下面先看一下最小单位Pod的定义：
```
apiVersion: v1
kind: Pod
metadata:
  annotations:
    cni.projectcalico.org/podIP: 10.230.6.219/32
    helm.sh/namespace: console-dev
    helm.sh/path: app
    helm.sh/release: log-search
    kubernetes.io/psp: 50-default
    v1.multus-cni.io/default-network: k8s-pod-network
  creationTimestamp: 2021-03-26T03:15:18Z
  generateName: log-search-67847b4fb4-
  labels:
    app: log-search
    controller.caicloud.io/chart: app
    controller.caicloud.io/name: log-search
    controller.caicloud.io/release: log-search
    pod-template-hash: 67847b4fb4
    project: console
    version: v1
  name: log-search-67847b4fb4-4pdsl
  namespace: console-dev
  ownerReferences:
  - apiVersion: apps/v1
    blockOwnerDeletion: true
    controller: true
    kind: ReplicaSet
    name: log-search-67847b4fb4
    uid: 6c7c7bd6-77e2-11eb-bea8-20677ce70b1c
  resourceVersion: "261129631"
  selfLink: /api/v1/namespaces/console-dev/pods/log-search-67847b4fb4-4pdsl
  uid: 7dc9efd2-8de1-11eb-bea8-20677ce70b1c
spec:
  containers:
  - command:
    - java
    - -server
    - -XX:+UseZGC
    - -Xmx400m
    - -jar
    - app.jar
    env:
    - name: POD_NAMESPACE
      valueFrom:
        fieldRef:
          apiVersion: v1
          fieldPath: metadata.namespace
    - name: POD_NAME
      valueFrom:
        fieldRef:
          apiVersion: v1
          fieldPath: metadata.name
    - name: POD_IP
      valueFrom:
        fieldRef:
          apiVersion: v1
          fieldPath: status.podIP
    - name: NODE_NAME
      valueFrom:
        fieldRef:
          apiVersion: v1
          fieldPath: spec.nodeName
    - name: APP_NAME
      valueFrom:
        fieldRef:
          apiVersion: v1
          fieldPath: metadata.labels['controller.caicloud.io/release']
    - name: HOST_IP
      valueFrom:
        fieldRef:
          apiVersion: v1
          fieldPath: status.hostIP
    - name: TENANT_NAME
      value: console
    - name: DEPLOY_ENV
      value: dev
    - name: SW_AGENT_NAME
      value: console#log-search#dev
    - name: CLUSTER_NAME
      value: qd-ctcc
    - name: SW_AGENT_COLLECTOR_BACKEND_HOST
      value: oap.apm.haier.net
    - name: SW_AGENT_COLLECTOR_BACKEND_SERVICES
      value: oap.apm.haier.net:26733
    envFrom:
    - configMapRef:
        name: console-dev.log-search.v19
    image: registry.haier.net/console_gitlab/log-search:v1.0.30-v2
    imagePullPolicy: Always
    name: c0
    readinessProbe:
      failureThreshold: 3
      httpGet:
        path: /api/v1/cat/test
        port: 8080
        scheme: HTTP
      initialDelaySeconds: 60
      periodSeconds: 10
      successThreshold: 1
      timeoutSeconds: 1
    resources:
      limits:
        cpu: 300m
        memory: 800Mi
      requests:
        cpu: 100m
        memory: 500Mi
    securityContext:
      allowPrivilegeEscalation: false
      privileged: false
      procMount: Default
    terminationMessagePath: /dev/termination-log
    terminationMessagePolicy: File
    volumeMounts:
    - mountPath: /var/run/secrets/kubernetes.io/serviceaccount
      name: default-token-ns4gc
      readOnly: true
  dnsPolicy: ClusterFirst
  imagePullSecrets:
  - name: ips-shun-guang-jing-xiang-cang-ku-vbdomzk-console-dev
  - name: ips-ri-ri-shun-jing-xiang-cang-ku-uprsuyh-console-dev
  - name: ips-dtsjing-xiang-cang-ku-vzglqrv-console-dev
  - name: ips-default-console-dev
  - name: ips-bei-jing-jing-xiang-cang-ku-dgougue-console-dev
  nodeName: kube-node-10-133-0-121
  restartPolicy: Always
  schedulerName: default-scheduler
  securityContext:
    runAsNonRoot: false
  serviceAccount: default
  serviceAccountName: default
  terminationGracePeriodSeconds: 30
  volumes:
  - name: default-token-ns4gc
    secret:
      defaultMode: 420
      secretName: default-token-ns4gc
status:
  conditions:
  - lastProbeTime: null
    lastTransitionTime: 2021-03-26T03:15:18Z
    status: "True"
    type: Initialized
  - lastProbeTime: null
    lastTransitionTime: 2021-03-26T03:17:10Z
    status: "True"
    type: Ready
  - lastProbeTime: null
    lastTransitionTime: 2021-03-26T03:17:10Z
    status: "True"
    type: ContainersReady
  - lastProbeTime: null
    lastTransitionTime: 2021-03-26T03:15:18Z
    status: "True"
    type: PodScheduled
  containerStatuses:
  - containerID: docker://ff37b2dbb1e4a124125f7790ccca286b376ee11ff60f8bbbb49baf956280d45e
    image: registry.haier.net/console_gitlab/log-search:v1.0.30-v2
    imageID: docker-pullable://registry.haier.net/console_gitlab/log-search@sha256:46a08906de56ce6e5a200f2f985d9cea10ce90af86cb55ff92f94f732471f983
    lastState: {}
    name: c0
    ready: true
    restartCount: 0
    state:
      running:
        startedAt: 2021-03-26T03:15:20Z
  hostIP: 10.133.0.121
  phase: Running
  podIP: 10.230.6.219
  qosClass: Burstable
  startTime: 2021-03-26T03:15:18Z
```

从Pod定义中可以看到该Pod是由Replica Set:log-search-67847b4fb4，下面看一下log-search-67847b4fb4的定义：
```
apiVersion: extensions/v1beta1
kind: ReplicaSet
metadata:
  annotations:
    deployment.kubernetes.io/desired-replicas: "2"
    deployment.kubernetes.io/max-replicas: "3"
    deployment.kubernetes.io/revision: "111"
    deployment.kubernetes.io/revision-history: "108"
    helm.sh/namespace: console-dev
    helm.sh/path: app
    helm.sh/release: log-search
  creationTimestamp: 2021-02-26T03:26:33Z
  generation: 6
  labels:
    app: log-search
    controller.caicloud.io/chart: app
    controller.caicloud.io/name: log-search
    controller.caicloud.io/release: log-search
    pod-template-hash: 67847b4fb4
    version: v1
  name: log-search-67847b4fb4
  namespace: console-dev
  ownerReferences:
  - apiVersion: apps/v1
    blockOwnerDeletion: true
    controller: true
    kind: Deployment
    name: log-search
    uid: b8c61330-3780-11ea-b6c2-20677ce70b1c
  resourceVersion: "261129633"
  selfLink: /apis/extensions/v1beta1/namespaces/console-dev/replicasets/log-search-67847b4fb4
  uid: 6c7c7bd6-77e2-11eb-bea8-20677ce70b1c
spec:
  replicas: 2
  selector:
    matchLabels:
      app: log-search
      controller.caicloud.io/chart: app
      controller.caicloud.io/name: log-search
      controller.caicloud.io/release: log-search
      pod-template-hash: 67847b4fb4
      version: v1
  template:
    metadata:
      annotations:
        helm.sh/namespace: console-dev
        helm.sh/path: app
        helm.sh/release: log-search
        v1.multus-cni.io/default-network: k8s-pod-network
      creationTimestamp: null
      labels:
        app: log-search
        controller.caicloud.io/chart: app
        controller.caicloud.io/name: log-search
        controller.caicloud.io/release: log-search
        pod-template-hash: 67847b4fb4
        version: v1
    spec:
      containers:
      - command:
        - java
        - -server
        - -XX:+UseZGC
        - -Xmx400m
        - -jar
        - app.jar
        env:
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.namespace
        - name: POD_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.name
        - name: POD_IP
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: status.podIP
        - name: NODE_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: spec.nodeName
        envFrom:
        - configMapRef:
            name: console-dev.log-search.v19
        image: registry.haier.net/console_gitlab/log-search:v1.0.30-v2
        imagePullPolicy: Always
        name: c0
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /api/v1/cat/test
            port: 8080
            scheme: HTTP
          initialDelaySeconds: 60
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources:
          limits:
            cpu: 300m
            memory: 800Mi
          requests:
            cpu: 100m
            memory: 500Mi
        securityContext:
          privileged: false
          procMount: Default
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        runAsNonRoot: false
      terminationGracePeriodSeconds: 30
status:
  availableReplicas: 2
  fullyLabeledReplicas: 2
  observedGeneration: 6
  readyReplicas: 2
  replicas: 2
```

从ReplicaSet定义中可以看到该ReplicaSet是由Deployment:log-search，下面看一下其定义：

```
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  annotations:
    deployment.kubernetes.io/revision: "111"
    helm.sh/namespace: console-dev
    helm.sh/path: app
    helm.sh/release: log-search
  creationTimestamp: 2020-01-15T10:20:58Z
  generation: 168
  labels:
    app: log-search
    controller.caicloud.io/chart: app
    controller.caicloud.io/release: log-search
    version: v1
  name: log-search
  namespace: console-dev
  ownerReferences:
  - apiVersion: release.caicloud.io/v1alpha1
    kind: Release
    name: log-search
    uid: b8b26af0-3780-11ea-b6c2-20677ce70b1c
  resourceVersion: "261129635"
  selfLink: /apis/extensions/v1beta1/namespaces/console-dev/deployments/log-search
  uid: b8c61330-3780-11ea-b6c2-20677ce70b1c
spec:
  progressDeadlineSeconds: 600
  replicas: 2
  revisionHistoryLimit: 10
  selector:
    matchLabels:
      app: log-search
      controller.caicloud.io/chart: app
      controller.caicloud.io/name: log-search
      controller.caicloud.io/release: log-search
      version: v1
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
    type: RollingUpdate
  template:
    metadata:
      annotations:
        helm.sh/namespace: console-dev
        helm.sh/path: app
        helm.sh/release: log-search
        v1.multus-cni.io/default-network: k8s-pod-network
      creationTimestamp: null
      labels:
        app: log-search
        controller.caicloud.io/chart: app
        controller.caicloud.io/name: log-search
        controller.caicloud.io/release: log-search
        version: v1
    spec:
      containers:
      - command:
        - java
        - -server
        - -XX:+UseZGC
        - -Xmx400m
        - -jar
        - app.jar
        env:
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.namespace
        - name: POD_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: metadata.name
        - name: POD_IP
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: status.podIP
        - name: NODE_NAME
          valueFrom:
            fieldRef:
              apiVersion: v1
              fieldPath: spec.nodeName
        envFrom:
        - configMapRef:
            name: console-dev.log-search.v19
        image: registry.haier.net/console_gitlab/log-search:v1.0.30-v2
        imagePullPolicy: Always
        name: c0
        readinessProbe:
          failureThreshold: 3
          httpGet:
            path: /api/v1/cat/test
            port: 8080
            scheme: HTTP
          initialDelaySeconds: 60
          periodSeconds: 10
          successThreshold: 1
          timeoutSeconds: 1
        resources:
          limits:
            cpu: 300m
            memory: 800Mi
          requests:
            cpu: 100m
            memory: 500Mi
        securityContext:
          privileged: false
          procMount: Default
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
      dnsPolicy: ClusterFirst
      restartPolicy: Always
      schedulerName: default-scheduler
      securityContext:
        runAsNonRoot: false
      terminationGracePeriodSeconds: 30
status:
  availableReplicas: 2
  conditions:
  - lastTransitionTime: 2021-02-26T02:15:37Z
    lastUpdateTime: 2021-03-26T03:15:15Z
    message: ReplicaSet "log-search-67847b4fb4" has successfully progressed.
    reason: NewReplicaSetAvailable
    status: "True"
    type: Progressing
  - lastTransitionTime: 2021-03-26T03:17:10Z
    lastUpdateTime: 2021-03-26T03:17:10Z
    message: Deployment has minimum availability.
    reason: MinimumReplicasAvailable
    status: "True"
    type: Available
  observedGeneration: 168
  readyReplicas: 2
  replicas: 2
  updatedReplicas: 2
```
从Deployment定义中可以看到该Deployment是由Release:log-search，下面看一下其的定义：

```
apiVersion: release.caicloud.io/v1alpha1
kind: Release
metadata:
  annotations:
    release.caicloud.io/alias: log-search
    release.caicloud.io/lastOperation: updating
  creationTimestamp: 2020-01-15T10:20:58Z
  generation: 1
  labels:
    release.caicloud.io/kind: deployments
  name: log-search
  namespace: console-dev
  resourceVersion: "261129634"
  selfLink: /apis/release.caicloud.io/v1alpha1/namespaces/console-dev/releases/log-search
  uid: b8b26af0-3780-11ea-b6c2-20677ce70b1c
spec:
  config: '{"_config":{"_metadata":{"name":"app","version":"1.0.0","description":""},"controllers":[{"type":"Deployment","controller":{"replica":1,"ready":0,"name":"log-search","strategy":{"type":"RollingUpdate","unavailable":0,"surge":1}},"pod":{"restart":"Always","dns":"ClusterFirst","hostname":"","subdomain":"","termination":30,"isPrivilege":false,"securityContext":{"runAsNonRoot":false},"hostAliases":[],"host":{"network":false,"pid":false,"ipc":false},"__isMonitor":false,"annotations":[{"key":"v1.multus-cni.io/default-network","value":"k8s-pod-network"}]},"schedule":{},"containers":[{"env":[],"envFrom":[{"type":"Config","name":"console-dev.log-search.v19","__key":"CMDB_URL"}],"mounts":[],"command":["java","-server","-XX:+UseZGC","-Xmx400m","-jar","app.jar"],"args":[],"lifecycle":{},"__isEnvCustom":false,"__isEnvFrom":true,"__isLog":false,"__isMountFile":false,"__liveness":false,"__readiness":true,"image":"registry.haier.net/console_gitlab/log-search:v1.0.30-v2","imagePullPolicy":"Always","name":"c0","probe":{"readiness":{"handler":{"type":"HTTP","method":{"scheme":"HTTP","host":"","port":"8080","path":"/api/v1/cat/test"}},"delay":60,"timeout":1,"period":10,"threshold":{"success":1,"failure":3}}},"resources":{"limits":{"cpu":"0.3","memory":"800Mi"},"requests":{"cpu":"0.1","memory":"500Mi"}},"securityContext":{"privileged":false}}],"volumes":[],"initContainers":[],"services":[{"type":"ClusterIP","name":"log-search","ports":[{"protocol":"HTTP","targetPort":8080,"port":8080,"nodePort":0}]}]}]}}'
  template: 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
status:
  conditions:
  - lastTransitionTime: 2021-03-26T03:14:05Z
    reason: Available
    status: "True"
    type: Available
  details:
    app:
      path: app
      resources:
        /v1, Kind=Service:
          Running: 1
        apps/v1, Kind=Deployment:
          Running: 1
  lastUpdateTime: 2021-03-26T03:14:05Z
  manifest: |-
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      annotations:
        helm.sh/namespace: console-dev
        helm.sh/path: app
        helm.sh/release: log-search
      creationTimestamp: null
      labels:
        app: log-search
        controller.caicloud.io/chart: app
        controller.caicloud.io/release: log-search
        version: v1
      name: log-search
    spec:
      replicas: 1
      selector:
        matchLabels:
          app: log-search
          controller.caicloud.io/chart: app
          controller.caicloud.io/name: log-search
          controller.caicloud.io/release: log-search
          version: v1
      strategy:
        rollingUpdate:
          maxSurge: 1
          maxUnavailable: 0
        type: RollingUpdate
      template:
        metadata:
          annotations:
            helm.sh/namespace: console-dev
            helm.sh/path: app
            helm.sh/release: log-search
            v1.multus-cni.io/default-network: k8s-pod-network
          creationTimestamp: null
          labels:
            app: log-search
            controller.caicloud.io/chart: app
            controller.caicloud.io/name: log-search
            controller.caicloud.io/release: log-search
            version: v1
        spec:
          containers:
          - command:
            - java
            - -server
            - -XX:+UseZGC
            - -Xmx400m
            - -jar
            - app.jar
            env:
            - name: POD_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: POD_IP
              valueFrom:
                fieldRef:
                  fieldPath: status.podIP
            - name: NODE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
            envFrom:
            - configMapRef:
                name: console-dev.log-search.v19
            image: registry.haier.net/console_gitlab/log-search:v1.0.30-v2
            imagePullPolicy: Always
            name: c0
            readinessProbe:
              failureThreshold: 3
              httpGet:
                path: /api/v1/cat/test
                port: 8080
                scheme: HTTP
              initialDelaySeconds: 60
              periodSeconds: 10
              successThreshold: 1
              timeoutSeconds: 1
            resources:
              limits:
                cpu: 300m
                memory: 800Mi
              requests:
                cpu: 100m
                memory: 500Mi
            securityContext:
              privileged: false
          dnsPolicy: ClusterFirst
          restartPolicy: Always
          securityContext:
            runAsNonRoot: false
          terminationGracePeriodSeconds: 30
    status: {}
    ---
    apiVersion: v1
    kind: Service
    metadata:
      annotations:
        helm.sh/namespace: console-dev
        helm.sh/path: app
        helm.sh/release: log-search
      creationTimestamp: null
      labels:
        app: log-search
        controller.caicloud.io/chart: app
        controller.caicloud.io/release: log-search
        version: v1
      name: log-search
    spec:
      ports:
      - name: http-8080
        port: 8080
        protocol: TCP
        targetPort: 8080
      selector:
        controller.caicloud.io/name: log-search
      type: ClusterIP
    status:
      loadBalancer: {}
  podStatistics:
    updatedPods:
      Running: 2
  version: 119
```

这里需要注意一下，我们k8s集群管理用的是才云的，而才云对于k8s中很多资源进行了封装，这里看到的Release就是对Deployment的封装。才云对外暴露接口是以release的维度。

具体可以看：https://github.com/caicloud/charts

到这里可以看到，这些资源之间的关系是：
```
Release -> Deployment -> ReplicaSet -> Pod
```

那么，Service与Pod是怎么关联起来了呢？下面看一下Kubernetes Service的构成：
```
apiVersion: v1
kind: Service
metadata:
  annotations:
    helm.sh/namespace: console-dev
    helm.sh/path: app
    helm.sh/release: log-search
  creationTimestamp: 2020-01-15T10:20:58Z
  labels:
    app: log-search
    controller.caicloud.io/chart: app
    controller.caicloud.io/release: log-search
    version: v1
  name: log-search
  namespace: console-dev
  ownerReferences:
  - apiVersion: release.caicloud.io/v1alpha1
    kind: Release
    name: log-search
    uid: b8b26af0-3780-11ea-b6c2-20677ce70b1c
  resourceVersion: "70295244"
  selfLink: /api/v1/namespaces/console-dev/services/log-search
  uid: b8c532b4-3780-11ea-b6c2-20677ce70b1c
spec:
  clusterIP: 10.230.248.17
  ports:
  - name: http-8080
    port: 8080
    protocol: TCP
    targetPort: 8080
  selector:
    controller.caicloud.io/name: log-search
  sessionAffinity: None
  type: ClusterIP
status:
  loadBalancer: {}
```

从Kubernetes Service的构成中可以看到该Service也是由Release创建的。

从其yaml中可以看到Service 的 VIP 地址 10.230.248.17，你就可以访问到它所代理的 Pod 了：



* Labels 主要用来筛选资源和组合资源，可以使用类似于 SQL 查询 select，来根据 Label 查询相关的资源。
* Annotations 一般是系统或者工具用来存储资源的非标示性信息，可以用来扩展资源的 spec/status 的描述


https://draveness.me/kubernetes-service/