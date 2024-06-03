FROM  node

COPY . /home/app

RUN cd /home/app && npm i